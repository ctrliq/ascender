import { isSocialLoginUrl, submitSocialLoginForm } from './socialLogin';

describe('isSocialLoginUrl', () => {
  it('matches a relative social-auth login URL', () => {
    expect(isSocialLoginUrl('/sso/login/saml/?idp=corp')).toBe(true);
    expect(isSocialLoginUrl('/sso/login/azuread-oauth2/')).toBe(true);
  });

  it('matches the same endpoint given as an absolute same-origin URL', () => {
    expect(
      isSocialLoginUrl(`${window.location.origin}/sso/login/saml/?idp=corp`)
    ).toBe(true);
  });

  it('matches the endpoint under a mount prefix', () => {
    expect(isSocialLoginUrl('/ascender/sso/login/saml/')).toBe(true);
  });

  it('rejects the same path on another origin', () => {
    expect(isSocialLoginUrl('https://idp.example.com/sso/login/saml/')).toBe(
      false
    );
  });

  it('rejects other local and external URLs', () => {
    expect(isSocialLoginUrl('/sso/complete/saml/')).toBe(false);
    expect(isSocialLoginUrl('/xsso/login/saml/')).toBe(false);
    expect(isSocialLoginUrl('/#/login')).toBe(false);
    expect(isSocialLoginUrl('https://portal.example.com/login')).toBe(false);
  });

  it('rejects an unparseable URL', () => {
    expect(isSocialLoginUrl('http://')).toBe(false);
    expect(isSocialLoginUrl('')).toBe(false);
  });
});

describe('submitSocialLoginForm', () => {
  afterEach(() => {
    document.querySelector('form[action^="/sso/login/"]')?.remove();
    document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('POSTs a form carrying the CSRF cookie to the login URL', () => {
    document.cookie = 'csrftoken=TESTTOKEN';
    const submit = vi
      .spyOn(HTMLFormElement.prototype, 'submit')
      .mockImplementation(() => {});

    submitSocialLoginForm('/sso/login/saml/?idp=corp');

    const form = document.querySelector(
      'form[action="/sso/login/saml/?idp=corp"]'
    ) as HTMLFormElement;
    expect(form).not.toBeNull();
    expect(form.method).toEqual('post');
    expect(
      (
        form.querySelector(
          'input[name="csrfmiddlewaretoken"]'
        ) as HTMLInputElement
      ).value
    ).toEqual('TESTTOKEN');
    expect(submit).toHaveBeenCalledTimes(1);
    submit.mockRestore();
  });

  it('sends an empty token when no CSRF cookie is set', () => {
    const submit = vi
      .spyOn(HTMLFormElement.prototype, 'submit')
      .mockImplementation(() => {});

    submitSocialLoginForm('/sso/login/github/');

    const input = document.querySelector(
      'form[action="/sso/login/github/"] input[name="csrfmiddlewaretoken"]'
    ) as HTMLInputElement;
    expect(input.value).toEqual('');
    expect(submit).toHaveBeenCalledTimes(1);
    submit.mockRestore();
  });
});
