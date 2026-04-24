const { legacyCreateProxyMiddleware } = require('http-proxy-middleware');

const TARGET = process.env.TARGET || 'https://localhost:8043';

module.exports = (app) => {
  app.use(
    legacyCreateProxyMiddleware(['/api', '/websocket', '/sso'], {
      target: TARGET,
      secure: false,
      ws: true,
    })
  );
};
