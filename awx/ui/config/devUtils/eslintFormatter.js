/**
 * Adapted from react-dev-utils (create-react-app).
 * Copyright (c) 2015-present, Facebook, Inc. MIT licensed.
 */

'use strict';

const path = require('path');
const { stripVTControlCharacters: stripAnsi } = require('util');
const colors = require('./colors');

const cwd = process.cwd();

const emitErrorsAsWarnings =
  process.env.NODE_ENV === 'development' &&
  process.env.ESLINT_NO_DEV_ERRORS === 'true';

function isError(message) {
  if (message.fatal || message.severity === 2) {
    return true;
  }
  return false;
}

function getRelativePath(filePath) {
  return path.relative(cwd, filePath);
}

// Lays rows out in left-aligned columns two spaces apart, ignoring ANSI
// colour codes when measuring width.
function table(rows) {
  const widths = [];
  rows.forEach((row) => {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] || 0, stripAnsi(cell).length);
    });
  });
  return rows
    .map((row) =>
      row
        .map((cell, i) => cell + ' '.repeat(widths[i] - stripAnsi(cell).length))
        .join('  ')
        .replace(/\s+$/, '')
    )
    .join('\n');
}

function formatter(results) {
  let output = '\n';
  let hasErrors = false;
  let reportContainsErrorRuleIDs = false;

  results.forEach((result) => {
    let messages = result.messages;
    if (messages.length === 0) {
      return;
    }

    messages = messages.map((message) => {
      let messageType;
      if (isError(message) && !emitErrorsAsWarnings) {
        messageType = 'error';
        hasErrors = true;
        if (message.ruleId) {
          reportContainsErrorRuleIDs = true;
        }
      } else {
        messageType = 'warn';
      }

      let line = message.line || 0;
      if (message.column) {
        line += ':' + message.column;
      }
      const position = colors.bold('Line ' + line + ':');
      return [
        '',
        position,
        messageType,
        message.message.replace(/\.$/, ''),
        colors.underline(message.ruleId || ''),
      ];
    });

    // if there are error messages, we want to show only errors
    if (hasErrors) {
      messages = messages.filter((m) => m[2] === 'error');
    }

    // add color to rule keywords
    messages.forEach((m) => {
      m[4] = m[2] === 'error' ? colors.red(m[4]) : colors.yellow(m[4]);
      m.splice(2, 1);
    });

    // print the filename and relative path
    output += `${getRelativePath(result.filePath)}\n`;

    // print the errors
    output += `${table(messages)}\n\n`;
  });

  if (reportContainsErrorRuleIDs) {
    // Unlike with warnings, we have to do it here.
    // We have similar code in react-scripts for warnings,
    // but warnings can appear in multiple files so we only
    // print it once at the end. For errors, however, we print
    // it here because we always show at most one error, and
    // we can only be sure it's an ESLint error before exiting
    // this function.
    output +=
      'Search for the ' +
      colors.underline(colors.red('keywords')) +
      ' to learn more about each error.';
  }

  return output;
}

module.exports = formatter;
