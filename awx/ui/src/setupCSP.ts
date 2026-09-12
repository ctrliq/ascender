// The nonce for the style tags styled-components injects is carried by the
// <meta name="sc-nonce"> that Django renders into index.html, which
// styled-components looks for before anything else. It replaces the
// __webpack_nonce__ global this used to assign, which only webpack understood.

// Send report when a CSP violation occurs
// See: https://w3c.github.io/webappsec-csp/2/#violation-reports
// See: https://developer.mozilla.org/en-US/docs/Web/API/SecurityPolicyViolationEvent
document.addEventListener('securitypolicyviolation', (e) => {
  const violation: { 'csp-report': Record<string, string | number> } = {
    'csp-report': {
      'blocked-uri': e.blockedURI,
      'document-uri': e.documentURI,
      'effective-directive': e.effectiveDirective,
      'original-policy': e.originalPolicy,
      referrer: e.referrer,
      'status-code': e.statusCode,
      'violated-directive': e.violatedDirective,
    },
  };
  if (e.sourceFile) violation['csp-report']['source-file'] = e.sourceFile;
  if (e.lineNumber) violation['csp-report']['line-number'] = e.lineNumber;
  if (e.columnNumber) violation['csp-report']['column-number'] = e.columnNumber;

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/csp-violation/', true);
  xhr.setRequestHeader('content-type', 'application/csp-report');
  xhr.send(JSON.stringify(violation));
});
