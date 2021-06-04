#!/usr/bin/env node
/* global require process */

const fs = require('fs');
const path = require('path');
const os = require("os");

// command = "   	/usr/bin/gcc     -U_FORTIFY_SOURCE -fstack-protector -Wall -Wunused-but-set-parameter -Wno-free-nonheap-object -fno-omit-frame-pointer -std=c++0x -f\"no -canonical-system-headers\" -Wno-builtin-macro-redefined -D__DATE__=\"redacted\" -D__TIMESTAMP__=\"redacted\" -D__TIME__=\"redacted\" -I \"bazel- out/k8-fastbuild/bin/server/_virtual_includes/server\" -I'bazel-out/ k8-fastbuild/bin/external/wt/_virtual_includes/wt' -I bazel\\ -out/k8-fastbuild/bin/external/rh_cpp_utils/reflection/_virtual_includes/reflection -I bazel-out/k8-fastbuild/bin/external/rh_cpp_utils/debug/_virtual_includes/debug -iquote . -iquote bazel-out/k8-fastbuild/genfiles -iquote bazel-out/k8-fastbuild/bin -iquote external/wt -iquote bazel-out/k8-fastbuild/genfiles/external/wt -iquote bazel-out/k8-fastbuild/bin/external/wt -iquote external/system -iquote bazel-out/k8-fastbuild/genfiles/external/system -iquote bazel-out/k8-fastbuild/bin/external/system -iquote external/rh_cpp_utils -iquote bazel-out/k8-fastbuild/genfiles/external/rh_cpp_utils -iquote bazel-out/k8-fastbuild/bin/external/rh_cpp_utils -x c++ -c server/wtx/SimpleComboBox.cpp  /usr/bin/gcc ";

// Old Bazel
// command = "/usr/bin/gcc -U_FORTIFY_SOURCE -fstack-protector -Wall -Wunused-but-set-parameter -Wno-free-nonheap-object -fno-omit-frame-pointer -std=c++0x -fno-canonical-system-headers -Wno-builtin-macro-redefined -D__DATE__=\"redacted\" -D__TIMESTAMP__=\"redacted\" -D__TIME__=\"redacted\" -I bazel-out/k8-fastbuild/bin/server/_virtual_includes/server -I bazel-out/k8-fastbuild/bin/external/wt/_virtual_includes/wt -I bazel-out/k8-fastbuild/bin/external/rh_cpp_utils/reflection/_virtual_includes/reflection -I bazel-out/k8-fastbuild/bin/external/rh_cpp_utils/debug/_virtual_includes/debug -iquote . -iquote bazel-out/k8-fastbuild/genfiles -iquote bazel-out/k8-fastbuild/bin -iquote external/wt -iquote bazel-out/k8-fastbuild/genfiles/external/wt -iquote bazel-out/k8-fastbuild/bin/external/wt -iquote external/system -iquote bazel-out/k8-fastbuild/genfiles/external/system -iquote bazel-out/k8-fastbuild/bin/external/system -iquote external/rh_cpp_utils -iquote bazel-out/k8-fastbuild/genfiles/external/rh_cpp_utils -iquote bazel-out/k8-fastbuild/bin/external/rh_cpp_utils -x c++ -c server/wtx/SimpleComboBox.cpp";

// New Bazel
// command = "/usr/bin/gcc -U_FORTIFY_SOURCE -fstack-protector -Wall -Wunused-but-set-parameter -Wno-free-nonheap-object -fno-omit-frame-pointer -std=c++0x -fno-canonical-system-headers -Wno-builtin-macro-redefined -D__DATE__=\"redacted\" -D__TIMESTAMP__=\"redacted\" -D__TIME__=\"redacted\" -I bazel-out/k8-fastbuild/bin/server/_virtual_includes/server -I bazel-out/k8-fastbuild/bin/external/wt/_virtual_includes/wt -I bazel-out/k8-fastbuild/bin/external/rh_cpp_utils/reflection/_virtual_includes/reflection -I bazel-out/k8-fastbuild/bin/external/rh_cpp_utils/debug/_virtual_includes/debug -iquote . -iquote bazel-out/k8-fastbuild/bin -iquote external/wt -iquote bazel-out/k8-fastbuild/bin/external/wt -iquote external/system -iquote bazel-out/k8-fastbuild/bin/external/system -iquote external/rh_cpp_utils -iquote bazel-out/k8-fastbuild/bin/external/rh_cpp_utils -x c++ -c server/wtx/SimpleComboBox.cpp"

// bazelWorkspaceDir = "/home/rh/projects/s600-solution/wtx";
// file = "server/wtx/SimpleComboBox.cpp";
// bazelExecroot = path.join(bazelWorkspaceDir, 'bazel-' + path.basename(bazelWorkspaceDir));

const unbox = ({ command, file }, bazelWorkspaceDir, bazelExecroot) => {
  command = command.trim(command);
  if(!path.isAbsolute(file)) {
    file = path.join(bazelExecroot, file);
  }

  // if(!path.isAbsolute(file)) {
  //   file = file.replace(
  //     RegExp('^' + path.join(removePrefixPath, path.sep)),
  //     '',
  //   );
  //   file = path.join(bazelWorkspaceDir, addPrefixPath, file);
  // }

  // Regexp selects quoted strings handling excape characters
  let commandParts = command.split(/(['"])((?:[^\1\\]|\\.)*?\1)/g);

  commandParts = commandParts.reduce((result, value) => {
    let last;
    if(result.length > 0) { last = result[result.length - 1]; }
    else last = '';
    if(last === '"' || last === "'") {
      result[result.length - 1] += value;
    }
    else if(value === '"' || value === "'") {
      result.push(value);
    }
    else {
      // Regexp selects non-white-space strings respecting escaped
      // white-space symbols
      result = result.concat(value.split(/([^\s](?:[^\s\\]|\\.)*)/g));
    }
    return result;
  }, []);

  commandParts = commandParts.reduce((result, value) => {
    if(value === '') { return result; }
    let last;
    if(result.length > 0) { last = result[result.length - 1]; }
    else last = '';
    if(last.match(/^(?:-I|-isystem|-iquote|-c|-x)\s*$/) ||
       last.match(/=\s*$/) ||
       value.match(/^\s+$/)
    ) {
      result[result.length - 1] += value;
    }
    else { result.push(value); }
    return result;
  }, []);

  commandParts = commandParts.reduce((result, value) => {
    let m = value.match(/^(-I|-isystem|-iquote|-c)\s*(.*?)(\s*)$/);
    if(m) {
      let absPath, relPath = m[2];
      if(relPath === '.') { return result; }
      relPath = relPath.replace(/^["']?(.+?)["']?$/, '$1');
      if(path.isAbsolute(relPath)) { absPath = relPath; }
      else {
        absPath = path.join(bazelWorkspaceDir, relPath);
        if(!fs.existsSync(absPath)) {
          absPath = path.join(bazelExecroot, relPath);
        }
        if(fs.existsSync(absPath)) {
          if(absPath.match(/\s/)) absPath = '"' + absPath + '"';
          value = m[1] + ' ' + absPath + m[3];
          result.push(value);
        }
      }
    }
    else { result.push(value); }
    return result;
  }, []);

  command = commandParts.join('');
  command = command.replace(/ +-fno-canonical-system-headers/, '');

  return { command, file, directory: bazelWorkspaceDir };
};

const args = process.argv.slice(2);

if(args.length != 4) {
  console.log(
    ['Usage: unbox path/to/compile_commands.json bazel/workspace/dir',
     'remove/prefix/path add/prefix/path',
    ].join(' ')
  );
  process.exit();
}

const compileCommandsPath = args[0].replace("~", os.homedir);

if(!fs.existsSync(compileCommandsPath)) {
  throw compileCommandsPath +  ' file does not exist';
}

const bazelWorkspaceDir = args[1].replace("~", os.homedir);

if(!fs.existsSync(bazelWorkspaceDir)) {
  throw bazelWorkspaceDir +  ' bazelWorkspaceDir does not exist';
}

const bazelExecroot = path.join(
  bazelWorkspaceDir, 'bazel-' + path.basename(bazelWorkspaceDir)
);

if(!fs.existsSync(bazelExecroot)) {
  throw bazelExecroot +  ' bazelExecroot does not exist';
}

const removePrefixPath = args[2];
const addPrefixPath = args[3];

let commandsString = fs.readFileSync(compileCommandsPath, 'utf8');
let commands = JSON.parse(commandsString);

for(let i = 0; i < commands.length; i++) {
  const command = commands[i];
  commands[i] = unbox(command, bazelWorkspaceDir, bazelExecroot);
}

fs.writeFileSync(compileCommandsPath, JSON.stringify(commands, null, 2));
