const TARGET = process.env.TARGET || 'https://localhost:8043';

module.exports = (app, createProxyMiddleware) => {
  if (typeof createProxyMiddleware !== 'function') {
    throw new Error('createProxyMiddleware must be provided to setupProxy');
  }

  app.use(
    createProxyMiddleware({
      pathFilter: ['/api', '/websocket', '/sso'],
      target: TARGET,
      secure: false,
      ws: true,
    })
  );
};
