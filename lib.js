// Hey Emacs, this is -*- coding: utf-8 -*-

const tokeniseCommand = (
  /** @type {string} */ command,
) => {
  // Regexp selects quoted strings handling excaped characters
  let commandParts = command.trim().split(/(['"])((?:[^\1\\]|\\.)*?\1)/g);

  // Re-split commandParts into white space and not-white space
  // respecting quatations and excaped characters
  commandParts = commandParts.reduce((result, value) => {
    let last;
    if(result.length > 0) { last = result[result.length - 1]; }
    else { last = ''; }
    if(last === '"' || last === '\'') {
      result[result.length - 1] += value;
    }
    else if(value === '"' || value === '\'') {
      result.push(value);
    }
    else {
      // Regexp selects non-white-space strings respecting escaped
      // white-space symbols
      // eslint-disable-next-line no-param-reassign
      result = result.concat(value.split(/([^\s](?:[^\s\\]|\\.)*)/g));
    }
    return result;
  }, /** @type {string[]} */ ([]));

  // Re-join parts into LCI command options and parameters
  commandParts = commandParts.reduce((result, value) => {
    if(value === '') { return result; }
    let last;
    if(result.length > 0) { last = result[result.length - 1]; }
    else { last = ''; }
    if(last.match(/^(?:-I|-isystem|-iquote|-c|-x)\s*$/) ||
       last.match(/=\s*$/) ||
       value.match(/^\s+$/)
    ) {
      result[result.length - 1] += value;
    }
    else { result.push(value); }
    return result;
  }, /** @type {string[]} */ ([]));

  commandParts = commandParts.map((value) => value.trim());

  return commandParts;
};

module.exports = {
  tokeniseCommand,
};
