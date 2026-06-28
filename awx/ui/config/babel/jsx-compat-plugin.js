'use strict';

const styledPlugin = require('babel-plugin-styled-components');
const wrapped = typeof styledPlugin === 'function' ? styledPlugin : styledPlugin.default;

const JSX_ALIASES = {
  jSXIdentifier: 'jsxIdentifier',
  jSXAttribute: 'jsxAttribute',
  jSXExpressionContainer: 'jsxExpressionContainer',
  jSXElement: 'jsxElement',
  jSXFragment: 'jsxFragment',
  jSXOpeningElement: 'jsxOpeningElement',
  jSXClosingElement: 'jsxClosingElement',
  jSXSpreadAttribute: 'jsxSpreadAttribute',
  jSXText: 'jsxText',
  jSXMemberExpression: 'jsxMemberExpression',
  jSXNamespacedName: 'jsxNamespacedName',
  jSXEmptyExpression: 'jsxEmptyExpression',
};

module.exports = function jsxCompatStyledComponents(api, options) {
  const proxiedApi = {
    ...api,
    types: new Proxy(api.types, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && prop in JSX_ALIASES && !(prop in target)) {
          return Reflect.get(target, JSX_ALIASES[prop], receiver);
        }
        return Reflect.get(target, prop, receiver);
      },
    }),
  };
  return wrapped(proxiedApi, options);
};
