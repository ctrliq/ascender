'use strict';

const babelJest = require('babel-jest').default;

const importMetaTransform = () => ({
  visitor: {
    MetaProperty(path) {
      path.replaceWithSourceString('({})');
    },
  },
});

module.exports = babelJest.createTransformer({
  presets: [
    [
      require.resolve('@babel/preset-env'),
      {
        targets: { node: 'current' },
      },
    ],
    [
      require.resolve('@babel/preset-react'),
      {
        runtime: 'automatic',
      },
    ],
  ],
  plugins: [
    require.resolve('@lingui/babel-plugin-lingui-macro'),
    require.resolve('../babel/jsx-compat-plugin'),
    importMetaTransform,
  ],
  babelrc: false,
  configFile: false,
});
