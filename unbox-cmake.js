#!/usr/bin/env node
// Hey Emacs, this is -*- coding: utf-8 -*-

const fs = require('fs');
const path = require('path');
const os = require('os');

const { tokeniseCommand } = require('./lib');

const bazelExtBuildDepReplacements = {
  'boost/include/boost-1_76': 'external/boost/src',
};

const bazelSandboxReplacements = {
  'external/wt/src/src/wt': 'external/wt/src/src/Wt',
  'external/wt/src/examples/onethread/lib':
    'external/wt/src/examples/onethread',
};

const bazelSandboxRegex = /^\/.+?\/sandbox\/.+?\/execroot\/.+?\/(.+)$/;

const bazelBuildTmpdirRegex =
  /^(\/.+?\/sandbox\/.+?\/execroot\/.+\/)([^/]+)(\/.+\.build_tmpdir\/?.*)$/;

const bazelExtBuildDepsRegex =
  /^\/.+?\/sandbox\/.+?\/execroot\/.+?\/.+?\/.+\.ext_build_deps\/(.+)$/;

const unbox = ({ command, file }, bazelWorkspacePath) => {
  const fileOrig = file;

  {
    let pathMatch = file.match(bazelBuildTmpdirRegex);
    if(pathMatch) {
      const depName = pathMatch[2];
      const copyPathStr = path.join(depName, `copy_${depName}`, depName);
      file = path.join(pathMatch[1], copyPathStr, pathMatch[3]);
    }

    pathMatch = file.match(bazelSandboxRegex);
    if(pathMatch) {
      let pathRelStr = pathMatch[1];
      if(pathRelStr in bazelSandboxReplacements) {
        pathRelStr = bazelExtBuildDepReplacements[pathRelStr];
      }
      file = path.join(bazelWorkspacePath, pathRelStr);
    }
  }

  if(!fs.existsSync(file)) {
    throw new Error(
      [`file = ${file} does not exist.`,
       `fileOrig = ${fileOrig}`,
      ].join(' '),
    );
  }

  let commandParts = tokeniseCommand(command);

  commandParts = commandParts.reduce((result, value) => {
    let m = value.match(/^(-I|-isystem|-iquote|-c)\s*(.*?)(\s*)$/);
    if(m) {
      let pathStrOrig = m[2];
      if(pathStrOrig === '.') {
        result.push(value);
        return result;
      }
      // Strip quatations if any
      pathStrOrig = pathStrOrig.replace(/^["']?(.+?)["']?$/, '$1');
      pathStrOrig = path.normalize(pathStrOrig);
      let pathStrProc = pathStrOrig;

      let pathMatch = pathStrProc.match(bazelExtBuildDepsRegex);
      if(pathMatch) {
        const depStr = pathMatch[1];
        if(depStr in bazelExtBuildDepReplacements) {
          pathStrProc = bazelExtBuildDepReplacements[depStr];
          pathStrProc = path.join(bazelWorkspacePath, pathStrProc);
        };
      }

      pathMatch = pathStrProc.match(bazelBuildTmpdirRegex);
      if(pathMatch) {
        const depName = pathMatch[2];
        const copyPathStr = path.join(depName, `copy_${depName}`, depName);
        pathStrProc = path.join(pathMatch[1], copyPathStr, pathMatch[3]);
        pathStrProc = path.join(bazelWorkspacePath, pathStrProc);
      }

      let unboxedAbsPathStr = pathStrProc;
      pathMatch = pathStrProc.match(bazelSandboxRegex);
      if(pathMatch) {
        let unboxedRelPathStr = pathMatch[1];
        if(unboxedRelPathStr in bazelSandboxReplacements) {
          unboxedRelPathStr = bazelSandboxReplacements[unboxedRelPathStr];
        };
        unboxedAbsPathStr =
          path.join(bazelWorkspacePath, unboxedRelPathStr);
      }

      if(fs.existsSync(unboxedAbsPathStr)) {
        pathStrProc = unboxedAbsPathStr;
      }
      else {
        console.log(
          [`unboxedAbsPathStr = ${unboxedAbsPathStr} does not exist.\n`,
           `pathStrOrig = ${pathStrOrig}\n`,
           `value = ${value}`,
          ].join(''),
        );
        process.exit(1);
      }

      if(pathStrProc.match(/\s/)) { pathStrProc = `"${pathStrProc}"`; };
      value = `${m[1]} ${pathStrProc}${m[3]}`;
      result.push(value);
    }
    else { result.push(value); }
    return result;
  }, []);

  command = commandParts.join('');
  command = command.replace(/ +-fno-canonical-system-headers/, '');

  return { command, file, directory: bazelWorkspacePath };
};

const args = process.argv.slice(2);

if(!(args.length == 2 || args.length == 3)) {
  console.log(
    ['Usage: unbox path/to/compile_commands.json',
     'bazel/workspace/path [include/prefix/path]',
    ].join(' ')
  );
  process.exit();
}

const compileCommandsPath = args[0].replace("~", os.homedir);

if(!fs.existsSync(compileCommandsPath)) {
  throw compileCommandsPath +  ' file does not exist';
}

const bazelWorkspacePath = args[1].replace("~", os.homedir);

if(!fs.existsSync(bazelWorkspacePath)) {
  throw bazelWorkspacePath +  ' bazelWorkspacePath does not exist';
}

const includePrefixPath =
  args[3] === undefined ? null : path.join(args[3], path.sep);

let commandsString = fs.readFileSync(compileCommandsPath, 'utf8');
const commandsIn = JSON.parse(commandsString);
const commandsOut = [];

if(includePrefixPath === null) {
  for(let command of commandsIn) {
    commandsOut.push(unbox(command, bazelWorkspacePath));
  }
}
else {
  for(let command of commandsIn) {
    if(command.file.startsWith(includePrefixPath)) {
      commandsOut.push(unbox(command, bazelWorkspacePath));
    }
  }
}


fs.writeFileSync(compileCommandsPath, JSON.stringify(commandsOut, null, 2));
