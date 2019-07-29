#!/usr/bin/env node

// adapted from https://gist.github.com/iauns/6276336

var fs = require('fs');
var argv = require('optimist')
  .usage('Merge multiple clang compile_commands.json into one file.')
  .demand('o')
  .alias('o', 'output')
  .describe('o', "Output merged compile_command.json file.")
  .argv;

var commands = [];
var lookup = {};

// Load primary JSON file (the output file) if it exists. This contains the
// entries that we will be overwriting or adding to.
if (argv.o && fs.existsSync(argv.o)) {
  var fileContents = fs.readFileSync(argv.o, 'utf8');
  commands = JSON.parse(fileContents);

  // Build associative lookup table. We don't want to do an N^2 search everytime
  // we get a possible new file.
  for (var i = 0; i < commands.length; i++) {
    lookup[commands[i].file] = commands[i];
    commands[i].command = commands[i].command;
 }
}

// Gather all of the compile_command files supplied on the command line.
files = argv._;

var counter = 0;
for (var kk = 0; kk < files.length; kk++) {
  var file = files[kk];
  // Load json file.
  var contents = fs.readFile(file, 'utf8', function (err, data) {
    if (data !== undefined) {
      var newCommands = JSON.parse(data);
      // Check to see if that command is already in the lookup table.
      for (var i = 0; i < newCommands.length; i++) {
        if (lookup.hasOwnProperty(newCommands[i].file)) {
          // If it is, then modify its commands to match what we just read.
          lookup[newCommands[i].file].command = newCommands[i].command;
          lookup[newCommands[i].file].directory = newCommands[i].directory;
        } else {
          // Otherwise add it to the lookup table and the commands array.
          newCommands[i].command = newCommands[i].command;
          commands.push(newCommands[i]);
          lookup[newCommands[i].file] = newCommands[i];
        }
      }
    } else {
      console.log('Undefined data for file: ' + file +  '!');
    }

    // Finish up if we have processed all of the files.
    counter = ++counter;
    if (counter === files.length) {
      fs.writeFileSync(argv.o,JSON.stringify(commands, null, 2));
    }
  });
}
