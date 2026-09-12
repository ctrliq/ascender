import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { babelTransform } from './config/build/babel.mjs';
import { srcAliases } from './config/build/aliases.mjs';

const resolvePath = (relative) =>
  fileURLToPath(new URL(relative, import.meta.url));

const TARGET = process.env.TARGET || 'https://localhost:8043';

/*
 * index.html is served to the browser by Django, out of awx/ui/build, which is
 * a template directory. So the built file is not plain HTML: it opens with a
 * {% load static %} and carries the CSP nonce Django renders per request.
 *
 * Keeping that markup in the source index.html would break the dev server,
 * which serves the file as-is, so it is injected here and only when building.
 */
function djangoTemplate() {
  return {
    name: 'awx:django-template',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html
          .replace(/^/, '{% load static %}\n')
          .replace(
            '<!--django-head-->',
            [
              '<script nonce="{{ csp_nonce }}" type="text/javascript">',
              "      window.NONCE_ID = '{{ csp_nonce }}';",
              '    </script>',
              // styled-components reads this before it reads anything else, so
              // the injected style tags carry the nonce the policy below names.
              '    <meta name="sc-nonce" content="{{ csp_nonce }}" />',
              '    <meta',
              '      http-equiv="Content-Security-Policy"',
              '      content="default-src \'self\'; connect-src \'self\' ws: wss:; style-src \'self\' \'unsafe-inline\'; script-src \'self\' \'nonce-{{ csp_nonce }}\' *.pendo.io; img-src \'self\' *.pendo.io data:; worker-src \'self\' blob: ;"',
              '    />',
              "    <link rel=\"shortcut icon\" href=\"{% static 'media/favicon.ico' %}\" />",
            ].join('\n')
          )
          // The Django one replaces it rather than joining it: only the
          // build knows how to reach the file through staticfiles.
          .replace(
            '    <link rel="shortcut icon" href="/static/media/favicon.ico" />\n',
            ''
          )
          .replace(
            '<!--django-body-->',
            '<style nonce="{{ csp_nonce }}">.app{height: 100%;}</style>'
          )
          .replace('<div id="app"', '<div id="app" class="app"');
      },
    },
  };
}

export default defineConfig({
  // basicSsl is what HTTPS=true gave the ejected dev server: a self-signed
  // certificate, so the UI is still served over https on 3001 and the browser
  // still has to be told once to trust it.
  plugins: [babelTransform(), react(), basicSsl(), djangoTemplate()],
  resolve: { alias: srcAliases },
  optimizeDeps: {
    // The scanner reads the source before any plugin runs, so it meets the
    // same JSX-in-.js the build does and has to be told the same thing.
    // Without this it cannot parse src/index.js, gives up, and the dev server
    // starts with no dependency pre-bundling at all.
    rolldownOptions: { moduleTypes: { '.js': 'jsx' } },
    // And left to itself it treats public/installing.html, which is a Django
    // template rather than an application entry, as one more thing to scan.
    entries: ['index.html'],
  },
  // Assets are written to build/static and Django publishes that directory at
  // /static/, so an absolute base is what makes the two line up.
  base: '/',
  publicDir: resolvePath('./public'),
  build: {
    outDir: 'build',
    emptyOutDir: true,
    // Stated rather than left to Vite's default, because Vite does not read
    // the browserslist policy in package.json the way the ejected build did.
    // This is that default written down, and package.json now says the same
    // thing for anything that does read browserslist.
    target: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'],
    // Kept off, as GENERATE_SOURCEMAP=false did under the ejected scripts.
    sourcemap: false,
    rollupOptions: {
      output: {
        // The layout Django and the Makefile expect: ui-devel copies
        // build/static/css, build/static/js and build/static/media into
        // /var/lib/awx/public/static, and STATICFILES_DIRS points at
        // build/static, so these three names are a contract rather than taste.
        entryFileNames: 'static/js/[name].[hash].js',
        chunkFileNames: 'static/js/[name].[hash].js',
        assetFileNames: ({ names }) => {
          const name = names?.[0] ?? '';
          if (name.endsWith('.css')) return 'static/css/[name].[hash][extname]';
          return 'static/media/[name].[hash][extname]';
        },
      },
    },
  },
  worker: {
    format: 'es',
    rollupOptions: {
      // Without this a worker is written to build/assets, which is not one of
      // Django's static directories, so the file 404s at runtime while the
      // build reports success. src/util/webWorker.js is the one that matters.
      output: {
        entryFileNames: 'static/js/[name].[hash].js',
        chunkFileNames: 'static/js/[name].[hash].js',
      },
    },
  },
  server: {
    // The ejected dev server bound to 0.0.0.0 and allowed any Host header.
    // The UI image starts this one and publishes the port, so the browser
    // reaching it is not on the loopback interface Vite listens on by
    // default, and does not arrive under a name Vite knows.
    host: process.env.HOST || '0.0.0.0',
    allowedHosts: true,
    port: 3001,
    // Off because the API is reached through the proxy below, on the same
    // origin, so there is nothing here for CORS to permit. Left on, Vite
    // answers every OPTIONS request itself as a preflight, with a 204 and no
    // body, and never forwards it. The API uses OPTIONS to describe its
    // fields, so screens that read data.actions.GET get undefined and throw.
    cors: false,
    // What src/setupProxy.js did under webpack-dev-server, and note what is
    // absent: changeOrigin. Rewriting the Host header to the target leaves the
    // browser sending Origin: https://localhost:3001 against a request that
    // now claims to be for :8043, and Django's CSRF check rejects the login
    // with a 403 because CSRF_TRUSTED_ORIGINS is empty and the two must match.
    proxy: {
      '/api': { target: TARGET, secure: false },
      '/sso': { target: TARGET, secure: false },
      '/websocket': { target: TARGET, secure: false, ws: true },
    },
  },
});
