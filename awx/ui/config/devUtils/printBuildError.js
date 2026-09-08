/**
 * Adapted from react-dev-utils (create-react-app).
 * Copyright (c) 2015-present, Facebook, Inc. MIT licensed.
 */

'use strict';

const colors = require('./colors');

module.exports = function printBuildError(err) {
  const message = err != null && err.message;
  const stack = err != null && err.stack;

  // Add a more helpful message for Terser errors.
  if (
    stack &&
    typeof message === 'string' &&
    message.indexOf('from Terser') !== -1
  ) {
    try {
      const matched = /(.+)\[(.+):(.+),(.+)\]\[.+\]/.exec(stack);
      if (!matched) {
        throw new Error('Using errors for control flow is bad.');
      }
      const problemPath = matched[2];
      const line = matched[3];
      const column = matched[4];
      console.log(
        'Failed to minify the code from this file: \n\n',
        colors.yellow(
          `\t${problemPath}:${line}${column !== '0' ? ':' + column : ''}`
        ),
        '\n'
      );
    } catch (ignored) {
      console.log('Failed to minify the bundle.', err);
    }
  } else {
    console.log((message || err) + '\n');
  }
  console.log();
};
