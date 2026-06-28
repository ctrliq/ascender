'use strict';

const babelJest = require('babel-jest').default;

const hasJsxRuntime = (() => {
  if (process.env.DISABLE_NEW_JSX_TRANSFORM === 'true') {
    return false;
  }

  try {
    require.resolve('react/jsx-runtime');
    return true;
  } catch (e) {
    return false;
  }
})();

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
      require.resolve('babel-preset-react-app'),
      {
        runtime: hasJsxRuntime ? 'automatic' : 'classic',
      },
    ],
  ],
  plugins: [
    require.resolve('babel-plugin-styled-components'),
    require.resolve('@babel/plugin-syntax-import-meta'),
    importMetaTransform,
  ],
  babelrc: false,
  configFile: false,
});
