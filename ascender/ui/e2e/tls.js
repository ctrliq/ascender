// Modifications Copyright (c) 2026 Ctrl IQ, Inc.
//
// The development environment's certificate is self-signed, so verification is
// off for loopback hosts. Anywhere else the suite's credentials would go to an
// unverified server, so it stays on unless ASCENDER_INSECURE_TLS=1 asks
// otherwise. NODE_EXTRA_CA_CERTS covers an instance with an internal CA.
const { URL } = require('url');

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

const insecureTLS = (base) =>
  LOOPBACK_HOSTS.includes(new URL(base).hostname) || process.env.ASCENDER_INSECURE_TLS === '1';

module.exports = { insecureTLS };
