'use strict';

const os = require('os');
const browserslist = require('browserslist');
const colors = require('./colors');

// The build targets the browsers listed under the `browserslist` key in
// package.json and deliberately does not fall back to browserslist's defaults.
function checkBrowsers(dir) {
  const current = browserslist.loadConfig({ path: dir });
  if (current == null) {
    throw new Error(
      colors.red('No target browsers are configured.') +
        os.EOL +
        `Please add a ${colors.underline('browserslist')} key to ${colors.bold(
          'package.json'
        )}.`
    );
  }
  return current;
}

module.exports = checkBrowsers;
