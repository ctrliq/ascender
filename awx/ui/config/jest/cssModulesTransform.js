// Native replacement for identity-obj-proxy.
// Returns the class name key as-is for string CSS module property accesses.
// Symbol keys are handled explicitly to avoid TypeErrors (e.g. Symbol.toStringTag).
module.exports = new Proxy(
  {},
  {
    get: function getter(_target, key) {
      if (typeof key === 'symbol') {
        if (key === Symbol.toStringTag) {
          return 'Object';
        }
        return undefined;
      }
      if (key === '__esModule') {
        return false;
      }
      return key;
    },
  }
);
