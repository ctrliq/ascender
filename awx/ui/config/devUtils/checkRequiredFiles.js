'use strict';

const fs = require('fs');
const path = require('path');
const colors = require('./colors');

// Returns true when every file exists; otherwise reports the first missing one.
function checkRequiredFiles(files) {
  let currentFilePath;
  try {
    files.forEach((filePath) => {
      currentFilePath = filePath;
      fs.accessSync(filePath, fs.constants.F_OK);
    });
    return true;
  } catch (err) {
    console.log(colors.red('Could not find a required file.'));
    console.log(
      colors.red('  Name: ') + colors.cyan(path.basename(currentFilePath))
    );
    console.log(
      colors.red('  Searched in: ') + colors.cyan(path.dirname(currentFilePath))
    );
    return false;
  }
}

module.exports = checkRequiredFiles;
