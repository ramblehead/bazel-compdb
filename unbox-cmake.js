#!/usr/bin/env node
// Hey Emacs, this is -*- coding: utf-8 -*-

const fs = require('fs');
const path = require('path');
const os = require('os');

const { tokeniseCommand } = require('./lib');

// const bazelExtBuildDepReplacements = {
//   'boost/include/boost-1_76': 'external/boost/src',
// };

// const bazelSandboxReplacements = {
//   'external/wt/src/src/wt': 'external/wt/src/src/Wt',
//   'external/wt/src/examples/onethread/lib':
//     'external/wt/src/examples/onethread',
// };

const config = {
  bazelExtBuildDepReplacements: {
    'boost/include/boost-1_76': 'external/boost/src',
  },
  bazelSandboxReplacements: {
  'external/wt/src/src/wt': 'external/wt/src/src/Wt',
  'external/wt/src/examples/onethread/lib':
    'external/wt/src/examples/onethread',
  },
};

const bazelSandboxRegex = /^\/.+?\/sandbox\/.+?\/execroot\/.+?\/(.+)$/;

const bazelBuildTmpdirRegex =
  /^(\/.+?\/sandbox\/.+?\/execroot\/.+\/)([^/]+)(\/.+\.build_tmpdir\/?.*)$/;

const bazelExtBuildDepsRegex =
  /^\/.+?\/sandbox\/.+?\/execroot\/.+?\/.+?\/.+\.ext_build_deps\/(.+)$/;

const unboxBuildTmpdir = (
  /** @type {string} */ file,
  /** @type {string} */ bazelWorkspacePath,
) => {
  let fileUnboxed = null;

  let pathStr = file;

  let pathMatch = file.match(bazelBuildTmpdirRegex);
  if(pathMatch) {
    const depName = pathMatch[2];
    const copyPathStr = path.join(depName, `copy_${depName}`, depName);
    pathStr = path.join(pathMatch[1], copyPathStr, pathMatch[3]);
  }

  pathMatch = pathStr.match(bazelSandboxRegex);
  if(pathMatch) {
    let pathRelStr = pathMatch[1];
    if(pathRelStr in config.bazelSandboxReplacements) {
      pathRelStr = config.bazelExtBuildDepReplacements[pathRelStr];
    }
    pathStr = path.join(bazelWorkspacePath, pathRelStr);
  }

  if(fs.existsSync(pathStr)) {
    fileUnboxed = pathStr;
  }

  return fileUnboxed;
};

/**
 * @typedef {{
 *   command: string,
 *   file: string,
 *   directory: string,
 * }} CompDbEntry
 */

const unbox = (
  /** @type {CompDbEntry} */ { command, file },
  /** @type {string} */ bazelWorkspacePath,
) => {
  const fileUnboxed = unboxBuildTmpdir(file, bazelWorkspacePath);

  if(fileUnboxed === null) {
    throw new Error(
      `"${fileUnboxed}" does not exist. Original file = "${file}."`,
    );
  }

  let commandParts = tokeniseCommand(command);

  commandParts = commandParts.reduce((result, value) => {
    const valueMatch = value.match(/^(-I|-isystem|-iquote|-c)\s*(.*?)(\s*)$/);
    if(valueMatch) {
      let pathStrOrig = valueMatch[2];
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
        if(depStr in config.bazelExtBuildDepReplacements) {
          pathStrProc = config.bazelExtBuildDepReplacements[depStr];
          pathStrProc = path.join(bazelWorkspacePath, pathStrProc);
        }
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
        if(unboxedRelPathStr in config.bazelSandboxReplacements) {
          unboxedRelPathStr =
            config.bazelSandboxReplacements[unboxedRelPathStr];
        }
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

      if(pathStrProc.match(/\s/)) { pathStrProc = `"${pathStrProc}"`; }

      // eslint-disable-next-line no-param-reassign
      value = `${valueMatch[1]} ${pathStrProc}${valueMatch[3]}`;
      result.push(value);
    }
    else { result.push(value); }
    return result;
  }, /** @type {string[]} */ ([]));

  let commandUnboxed = commandParts.join(' ');
  commandUnboxed =
    commandUnboxed.replace(/ +-fno-canonical-system-headers/, '');

  return {
    command: commandUnboxed,
    file: fileUnboxed,
    directory: bazelWorkspacePath,
  };
};

const args = process.argv.slice(2);

if(!(args.length === 2 || args.length === 3)) {
  throw new Error([
    'Usage: unbox path/to/compile_commands.json',
    'bazel/workspace/path [include/prefix/path]',
  ].join(' '));
}

const compileCommandsPath = args[0].replace('~', os.homedir);

if(!fs.existsSync(compileCommandsPath)) {
  throw Error(`${compileCommandsPath} file does not exist`);
}

const bazelWorkspacePath = args[1].replace('~', os.homedir);

if(!fs.existsSync(bazelWorkspacePath)) {
  throw Error(`${bazelWorkspacePath} bazelWorkspacePath does not exist`);
}

const includePrefixPath =
  args[3] === undefined ? null : path.join(args[3], path.sep);

const compDbString = fs.readFileSync(compileCommandsPath, 'utf8');

/** @type {CompDbEntry[]} */
const compDbIn = JSON.parse(compDbString);

/** @type {CompDbEntry[]} */
const compDbOut = [];

if(includePrefixPath === null) {
  compDbIn.forEach((compDbEntry) => (
    compDbOut.push(unbox(compDbEntry, bazelWorkspacePath))
  ));
}
else {
  compDbIn.forEach((compDbEntry) => {
    if(compDbEntry.file.startsWith(includePrefixPath)) {
      compDbOut.push(unbox(compDbEntry, bazelWorkspacePath));
    }
  });
}

fs.writeFileSync(compileCommandsPath, JSON.stringify(compDbOut, null, 2));
