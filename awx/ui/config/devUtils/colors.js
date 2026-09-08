'use strict';

const { styleText } = require('node:util');

// The subset of chalk's API that the build and dev-server scripts use, on top
// of Node's util.styleText. Colour is dropped automatically when stdout is not
// a TTY, and the NO_COLOR / FORCE_COLOR environment variables are honoured.
const style =
  (...formats) =>
  (text) =>
    styleText(formats, String(text));

module.exports = {
  bold: style('bold'),
  cyan: style('cyan'),
  dim: style('dim'),
  green: style('green'),
  red: style('red'),
  underline: style('underline'),
  yellow: style('yellow'),
};
