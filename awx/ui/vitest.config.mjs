import { fileURLToPath, URL } from 'node:url';
import { transformAsync } from '@babel/core';
import { defineConfig } from 'vitest/config';

const resolvePath = (relative) =>
  fileURLToPath(new URL(relative, import.meta.url));

const SOURCE = /\.[jt]sx?$/;

/*
 * The babel pass config/jest/babelTransform.js used to run, ported rather than
 * replaced. @vitejs/plugin-react is not the vehicle for it: version 6 dropped
 * babel entirely in favour of oxc, and oxc has no lingui macro, so the macros
 * in `useLingui()` and every t`...` would go through untransformed.
 *
 * @babel/preset-env is deliberately not here, where the jest transformer had
 * it. It only ever targeted the running node, and under babel-jest it also
 * rewrote the modules to CommonJS, which is the one thing that must not happen
 * now that Vite is handling ESM. JSX still needs babel, so preset-react stays.
 * The import.meta rewrite the transformer carried is gone with it: that existed
 * because jest could not parse the syntax, and Vitest is ESM.
 */
const babel = {
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
        resolvePath('./config/babel/jsx-compat-plugin.js'),
      ],
    });
    return { code: result.code, map: result.map };
  },
};

export default defineConfig({
  plugins: [babel],
  resolve: {
    // jest resolved these through modulePaths and moduleNameMapper. Vite has no
    // module search path, so every absolute import out of src is an alias.
    alias: [
      // The real registry reaches for require.context, which only webpack has,
      // so the mock stands in for it exactly as it did under jest. The pattern
      // has to catch the relative imports too, not only the bare one.
      {
        find: /(?:^|.*\/)themeRegistry(?:\.js)?$/,
        replacement: resolvePath('./testUtils/themeRegistryMock.js'),
      },
      {
        find: /^history$/,
        replacement: resolvePath('./testUtils/historyShim.js'),
      },
      { find: /^i18nLoader$/, replacement: resolvePath('./src/i18nLoader.js') },
      // Anchored, so node's own util is still reachable as node:util.
      {
        find: /^(api|components|contexts|hooks|screens|util)(\/|$)/,
        replacement: `${resolvePath('./src')}/$1$2`,
      },
    ],
  },
  test: {
    globals: true,
    // The VM pool reuses one environment per worker rather than building a
    // fresh jsdom for each of the 553 files, which is where this suite's time
    // was going: it took the environment share of the run from 26% to 2%, and
    // the whole suite from 16m to 5m39s. Module state stays isolated per file,
    // unlike isolate: false, which is 37% faster still and fails 102 tests.
    pool: 'vmThreads',
    environment: 'jsdom',
    // jest served pages from http://localhost/, where jsdom's own default is
    // http://localhost:3000/, and that is what window.location reads.
    environmentOptions: {
      jsdom: { url: 'http://localhost/' },
    },
    setupFiles: [
      resolvePath('./config/vitest/textEncoderPolyfill.js'),
      resolvePath('./src/setupTests.js'),
    ],
    include: [
      'src/**/__tests__/**/*.{js,jsx,ts,tsx}',
      'src/**/*.{spec,test}.{js,jsx,ts,tsx}',
      'testUtils/**/*.{spec,test}.{js,jsx,ts,tsx}',
    ],
    server: {
      deps: {
        // Node's ESM loader cannot load a .css file, and anything left external
        // goes through it rather than through Vite. react-styles imports its
        // stylesheets from inside node_modules, so it has to be inlined. This
        // is the knob jest spelled transformIgnorePatterns.
        inline: [/@patternfly\/react-styles/],
      },
    },
    // fsModuleCache is deliberately left off, which is Vitest's default. It is
    // the only thing that closes jest's repeat-run advantage, and whether it
    // helps depends entirely on the filesystem: measured over 56 files it takes
    // a second run from 90s to 68s natively, and from 101s to 108s inside the
    // container, where the cache is written through a bind mount. Turn it on
    // locally if your checkout is not bind mounted.
    // jest's resetMocks, and the timeout setupTests.js used to set by hand.
    mockReset: true,
    testTimeout: 120000,
    coverage: {
      include: ['src/**/*.{js,jsx}', 'testUtils/**/*.{js,jsx}'],
      exclude: ['src/locales/**', '**/index.js'],
    },
  },
});
