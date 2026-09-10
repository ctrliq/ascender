import { fileURLToPath, URL } from 'node:url';
import { transformAsync } from '@babel/core';

const resolvePath = (relative) =>
  fileURLToPath(new URL(relative, import.meta.url));

const SOURCE = /\.[jt]sx?$/;

/*
 * The babel pass the source cannot be built without, shared by the application
 * build and the test run so the two cannot disagree about what the source
 * means.
 *
 * The lingui macro is the reason babel is here at all. oxc, which Vite and
 * @vitejs/plugin-react use, has no macro support, so useLingui() and every t``
 * in the 486 files that import one would go through untransformed.
 *
 * JSX is transformed here rather than left to oxc because this codebase keeps
 * JSX in .js files, a create-react-app convention, and Vite 8 has no way to
 * say so: the option that used to carry it is not part of its oxc config.
 *
 * @babel/preset-env is deliberately absent. It only ever targeted the running
 * node, and under babel-jest it also rewrote the modules to CommonJS, which is
 * the one thing that must not happen now that ESM is handled natively.
 */
export function babelTransform() {
  return {
    name: 'awx:babel',
    enforce: 'pre',
    async transform(code, id) {
      if (!SOURCE.test(id.split('?')[0]) || id.includes('/node_modules/')) {
        return null;
      }
      const result = await transformAsync(code, {
        filename: id,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        presets: [['@babel/preset-react', { runtime: 'automatic' }]],
        plugins: [
          '@lingui/babel-plugin-lingui-macro',
          resolvePath('../babel/jsx-compat-plugin.js'),
        ],
      });
      return { code: result.code, map: result.map };
    },
  };
}

export default babelTransform;
