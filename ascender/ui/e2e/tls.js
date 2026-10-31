// Modifications Copyright (c) 2026 Ctrl IQ, Inc.
//
// The development environment's certificate is self-signed, so verification is
// off for loopback hosts. Anywhere else the suite's credentials would go to an
// unverified server, so it stays on unless ASCENDER_INSECURE_TLS=1 asks
// otherwise. NODE_EXTRA_CA_CERTS covers an instance with an internal CA.
//
// ignoreHTTPSErrors has no say over plain http, where the browser would type
// the password into an unencrypted page, so a non-loopback url has to be https
// and anything else stops the suite before a credential is sent. That only
// covers the configured url; guardTransport in tests/helpers.js holds the
// browser to the same rule for wherever the instance sends it afterwards.
const { URL } = require('url');

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

const isLoopback = (url) => LOOPBACK_HOSTS.includes(new URL(url).hostname);

// plain http is only allowed to a loopback host; https, and the browser's own
// schemes such as data: and blob:, always pass
const allowedTransport = (url) => new URL(url).protocol !== 'http:' || isLoopback(url);

function insecureTLS(base) {
  const url = new URL(base);
  const loopback = isLoopback(base);
  if (!loopback && url.protocol !== 'https:') {
    throw new Error(
      `ASCENDER_URL ${base} is not https; credentials are only sent unencrypted to a loopback host`
    );
  }
  return loopback || process.env.ASCENDER_INSECURE_TLS === '1';
}

module.exports = { allowedTransport, insecureTLS };
