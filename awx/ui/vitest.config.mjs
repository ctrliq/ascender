import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import { babelTransform } from './config/build/babel.mjs';
import { srcAliases } from './config/build/aliases.mjs';

const resolvePath = (relative) =>
  fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  plugins: [babelTransform()],
  resolve: {
    // The application's own aliases, plus the one module the tests stand in
    // for. Shared with vite.config.mjs rather than restated, so a module that
    // resolves when the application builds resolves the same way here.
    alias: [
      {
        find: /^history$/,
        replacement: resolvePath('./testUtils/historyShim.js'),
      },
      ...srcAliases,
    ],
  },
  test: {
    globals: true,
    // The VM pool reuses one environment per worker rather than building a
    // fresh jsdom for each of the 553 files, which is where this suite's time
    // was going: it took the environment share of the run from 26% to 2%, and
    // the whole suite from 16m to 5m39s. Module state stays isolated per file,
    // unlike isolate: false, which is 37% faster still and fails 102 tests.
    //
    // Forks rather than threads, because the VM contexts are what this costs
    // memory in and a thread pool keeps them all in one process heap: on a
    // twelve core machine that run reached 20GB and died in V8's own
    // allocator, four runs in five, with the machine itself far from full.
    // Each fork brings its own heap, and the run takes the same time.
    pool: 'vmForks',
    environment: 'jsdom',
    // jest served pages from http://localhost/, where jsdom's own default is
    // http://localhost:3000/, and that is what window.location reads.
    environmentOptions: {
      jsdom: { url: 'http://localhost/' },
    },
    setupFiles: [
      resolvePath('./config/vitest/textEncoderPolyfill.js'),
      resolvePath('./src/setupTests.ts'),
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
    // jest's resetMocks, and the timeout setupTests used to set by hand.
    mockReset: true,
    // Both, because Vitest has two timeouts where jest had one, and a hook that
    // renders a whole form can outrun the 10s hookTimeout default while every
    // other worker in the vm pool is doing the same thing.
    testTimeout: 120000,
    hookTimeout: 120000,
    coverage: {
      include: ['src/**/*.{js,jsx}', 'testUtils/**/*.{js,jsx}'],
      exclude: ['src/locales/**', '**/index.js'],
    },
  },
});
