const { UNSAFE_createMemoryHistory } = require('react-router');

function createMemoryHistory(opts) {
  return UNSAFE_createMemoryHistory({ v5Compat: true, ...opts });
}

module.exports = { createMemoryHistory };
