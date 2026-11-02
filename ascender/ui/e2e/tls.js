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
// browser to browserMayReach for wherever the instance sends it afterwards.
const { URL } = require('url');

const BASE_URL = process.env.ASCENDER_URL || 'https://localhost:8043';

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

const isLoopback = (url) => LOOPBACK_HOSTS.includes(new URL(url).hostname);

// The browser ignores certificate errors for the whole context, not only for
// the instance, so with a loopback instance it stays on the machine: a
// redirect elsewhere would otherwise hand the password to any server with any
// certificate. Against a remote instance, plain http is what it refuses.
// Schemes the browser serves itself, such as data: and blob:, always pass.
function browserMayReach(url) {
  const { protocol } = new URL(url);
  if (!['http:', 'https:'].includes(protocol) || isLoopback(url)) return true;
  return !isLoopback(BASE_URL) && protocol === 'https:';
}

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

module.exports = { BASE_URL, browserMayReach, insecureTLS };
