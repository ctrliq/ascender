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
 * The content security policy the built page carries, and the one rule the app
 * shell needs. Kept out of the source index.html because the dev server serves
 * that file as it stands, and its policy is not the built one.
 *
 * Nothing here is a Django template any more: the built index.html is plain
 * HTML, the same bytes a static file server would hand out.
 */
function contentSecurityPolicy() {
  return {
    name: 'awx:content-security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html
          .replace(
            '<!--django-head-->',
            [
              '<meta',
              '      http-equiv="Content-Security-Policy"',
              "      content=\"default-src 'self'; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; script-src 'self' *.pendo.io; img-src 'self' *.pendo.io data:; worker-src 'self' blob: ;\"",
              '    />',
            ].join('\n')
          )
          .replace('<!--django-body-->', '<style>.app{height: 100%;}</style>')
          .replace('<div id="app"', '<div id="app" class="app"');
      },
    },
  };
}

export default defineConfig({
  // basicSsl is what HTTPS=true gave the ejected dev server: a self-signed
  // certificate, so the UI is still served over https on 3001 and the browser
  // still has to be told once to trust it.
  plugins: [babelTransform(), react(), basicSsl(), contentSecurityPolicy()],
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
