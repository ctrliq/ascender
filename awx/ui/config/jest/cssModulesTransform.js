// Native replacement for identity-obj-proxy.
// Returns the class name key as-is for any CSS module property access.
module.exports = new Proxy(
  {},
  {
    get: function getter(_target, key) {
      if (key === '__esModule') {
        return false;
      }
      return key;
    },
  }
);
