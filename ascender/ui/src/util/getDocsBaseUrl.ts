/**
 * Returns the base url of the documentation site.
 *
 * Args:
 *   config: the platform's config, which every call site still passes. It is
 *     unused: the url carried a version only for the subscription product, and
 *     is kept in the signature so a future version-specific url needs no
 *     change at the callers.
 *
 * Returns:
 *   The documentation site's base url, without a trailing slash.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function getDocsBaseUrl(config?: unknown): string {
  return `https://docs.ascender-automation.org`;
}
