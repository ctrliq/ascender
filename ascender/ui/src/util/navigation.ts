function locationReplace(url: string): void {
  window.location.replace(url);
}

/**
 * True when handing `url` to `window.location` would fetch a page rather
 * than run it. A `javascript:` or `data:` URL resolves and "navigates" but
 * executes in the visitor's browser instead; only http and https (which a
 * relative path inherits from this page) are fit for a redirect.
 */
export function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url, window.location.origin);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export default locationReplace;
