import { getCookie } from 'api/Base';

// social-auth-app-django 6.x serves its login-initiation view
// (`/sso/login/<backend>/`) with `@require_POST`, so navigating there with
// a link or `window.location` (a GET) is answered with 405. Every entry
// point that hands the browser to an identity provider goes through here.

/**
 * True when `url` points at this deployment's social-auth login-initiation
 * endpoint, the only place that has to be reached with a POST. Anything
 * else (the login page, an external portal, a URL that does not parse) is
 * a plain navigation, and must never receive the CSRF token.
 */
export function isSocialLoginUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url, window.location.origin);
  } catch {
    return false;
  }
  return (
    parsed.origin === window.location.origin &&
    parsed.pathname.includes('/sso/login/')
  );
}

/**
 * Leave the page for `loginUrl` with a CSRF-carrying POST, the way a
 * `<form method="post">` would. Submitting unloads the page, so nothing
 * runs after this returns.
 */
export function submitSocialLoginForm(loginUrl: string): void {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = loginUrl;
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'csrfmiddlewaretoken';
  input.value = getCookie('csrftoken') ?? '';
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}
