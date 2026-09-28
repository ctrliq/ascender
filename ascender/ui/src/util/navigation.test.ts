import { isHttpUrl } from './navigation';

describe('isHttpUrl', () => {
  it('accepts server-relative paths, which inherit the page scheme', () => {
    expect(isHttpUrl('/sso/login/saml/?idp=corp')).toBe(true);
    expect(isHttpUrl('sso/login/saml/')).toBe(true);
  });

  it('accepts http and https URLs, whatever the host', () => {
    expect(isHttpUrl('https://idp.example.com/start')).toBe(true);
    expect(isHttpUrl('http://keycloak/realms/corp')).toBe(true);
    expect(isHttpUrl('HTTPS://idp.example.com/')).toBe(true);
    expect(isHttpUrl('//sso.example.com/login')).toBe(true);
  });

  it('rejects schemes a browser would execute', () => {
    // The literals below are the very values under test.
    // eslint-disable-next-line no-script-url
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    // eslint-disable-next-line no-script-url
    expect(isHttpUrl('JavaScript:alert(1)')).toBe(false);
    expect(isHttpUrl(' javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('java\tscript:alert(1)')).toBe(false);
    expect(isHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isHttpUrl('vbscript:msgbox(1)')).toBe(false);
  });

  it('rejects other protocols and unparseable values', () => {
    expect(isHttpUrl('mailto:someone@example.com')).toBe(false);
    expect(isHttpUrl('ftp://files.example.com/')).toBe(false);
    expect(isHttpUrl('http://')).toBe(false);
  });
});
