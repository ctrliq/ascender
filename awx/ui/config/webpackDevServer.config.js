'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const getHttpsConfig = require('./getHttpsConfig');

const escapeRegExp = (text) => text.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');

// Matches every node_modules directory except the one under src/, which is
// kept watched to support absolute imports.
// https://github.com/facebook/create-react-app/issues/1065
function ignoredFiles(appSrc) {
  // No `g` flag: chokidar reuses this RegExp with .test() across many paths,
  // and a global regex carries lastIndex between calls, so matches would
  // alternate.
  return new RegExp(
    `^(?!${escapeRegExp(
      path.normalize(appSrc + '/').replace(/[\\]+/g, '/')
    )}).+/node_modules/`
  );
}

// Redirects requests outside the served path (PUBLIC_URL / homepage) into it.
function redirectServedPath(servedPath) {
  // remove end slash so user can land on `/test` instead of `/test/`
  servedPath = servedPath.slice(0, -1);
  return function redirectServedPathMiddleware(req, res, next) {
    if (
      servedPath === '' ||
      req.url === servedPath ||
      req.url.startsWith(servedPath)
    ) {
      next();
    } else {
      const newPath = path.posix.join(
        servedPath,
        req.path !== '/' ? req.path : ''
      );
      res.redirect(newPath);
    }
  };
}

const host = process.env.HOST || '0.0.0.0';
const sockHost = process.env.WDS_SOCKET_HOST;
const sockPath = process.env.WDS_SOCKET_PATH; // default: '/ws'
const sockPort = process.env.WDS_SOCKET_PORT;

module.exports = function (proxyOptions = {}) {
  const { createProxyMiddleware } = proxyOptions;
  return {
    // WebpackDevServer 2.4.3 introduced a security fix that prevents remote
    // websites from potentially accessing local content through DNS rebinding:
    // https://github.com/webpack/webpack-dev-server/issues/887
    // https://medium.com/webpack/webpack-dev-server-middleware-security-issues-1489d950874a
    // However, it made several existing use cases such as development in cloud
    // environment or subdomains in development significantly more complicated:
    // https://github.com/facebook/create-react-app/issues/2271
    // https://github.com/facebook/create-react-app/issues/2233
    // Since this configuration only serves files in the `public` folder and
    // the API proxy in src/setupProxy.js is explicitly opted into, the host
    // check is disabled, as it always has been for this project.
    allowedHosts: 'all',
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*',
    },
    // Enable gzip compression of generated files.
    compress: true,
    static: {
      // By default WebpackDevServer serves physical files from current directory
      // in addition to all the virtual build products that it serves from memory.
      // This is confusing because those files won’t automatically be available in
      // production build folder unless we copy them. However, copying the whole
      // project directory is dangerous because we may expose sensitive files.
      // Instead, we establish a convention that only files in `public` directory
      // get served. Our build script will copy `public` into the `build` folder.
      // In `index.html`, you can get URL of `public` folder with %PUBLIC_URL%:
      // <link rel="icon" href="%PUBLIC_URL%/favicon.ico">
      // In JavaScript code, you can access it with `process.env.PUBLIC_URL`.
      // Note that we only recommend to use `public` folder as an escape hatch
      // for files like `favicon.ico`, `manifest.json`, and libraries that are
      // for some reason broken when imported through webpack. If you just want to
      // use an image, put it in `src` and `import` it from JavaScript instead.
      directory: paths.appPublic,
      publicPath: [paths.publicUrlOrPath],
      // By default files from `contentBase` will not trigger a page reload.
      watch: {
        // Reportedly, this avoids CPU overload on some systems.
        // https://github.com/facebook/create-react-app/issues/293
        // src/node_modules is not ignored to support absolute imports
        // https://github.com/facebook/create-react-app/issues/1065
        ignored: ignoredFiles(paths.appSrc),
      },
    },
    client: {
      webSocketURL: {
        // Enable custom sockjs pathname for websocket connection to hot reloading server.
        // Enable custom sockjs hostname, pathname and port for websocket connection
        // to hot reloading server.
        hostname: sockHost,
        pathname: sockPath,
        port: sockPort,
      },
      overlay: {
        errors: true,
        warnings: false,
        // The browser reports "ResizeObserver loop completed with undelivered
        // notifications" when an observed element resizes during another
        // element's measurement delivery — benign, and unavoidable while
        // react-virtual's dev build flushes row measurements synchronously on
        // a streaming job. Keep it out of the full-screen overlay; it still
        // reaches the console and window 'error' listeners.
        runtimeErrors: (error) =>
          !/ResizeObserver loop/.test((error && error.message) || ''),
      },
    },
    devMiddleware: {
      // It is important to tell WebpackDevServer to use the same "publicPath" path as
      // we specified in the webpack config. When homepage is '.', default to serving
      // from the root.
      // remove last slash so user can land on `/test` instead of `/test/`
      publicPath: paths.publicUrlOrPath.slice(0, -1),
    },
    server: {
      type: 'https', // Specify the server type as 'https'
      ...getHttpsConfig()
    },
    host,
    historyApiFallback: {
      // Paths with dots should still use the history fallback.
      // See https://github.com/facebook/create-react-app/issues/387.
      disableDotRule: true,
      index: paths.publicUrlOrPath,
    },
    setupMiddlewares(middlewares, devServer) {
      if (fs.existsSync(paths.proxySetup)) {
        // This registers user provided middleware for proxy reasons
        require(paths.proxySetup)(devServer.app, createProxyMiddleware);
      }

      // Redirect to `PUBLIC_URL` or `homepage` from `package.json` if url not match
      devServer.app.use(redirectServedPath(paths.publicUrlOrPath));

      return middlewares;
    },
  };
};
