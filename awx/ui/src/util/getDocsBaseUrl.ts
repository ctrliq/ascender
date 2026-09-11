/**
 * Returns the base url of the documentation site.
 *
 * Args:
 *   config: the platform's config, which every call site still passes. It is
 *     unused while the version-specific url below stays commented out, and is
 *     kept in the signature so restoring that needs no change at the callers.
 *
 * Returns:
 *   The documentation site's base url, without a trailing slash.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function getDocsBaseUrl(config?: unknown): string {
  // let version = '4.5';
  // const licenseType = config?.license_info?.license_type;

  // if (licenseType && licenseType !== 'open' && config?.version) {
  //   version = parseFloat(config?.version.split('-')[0]).toFixed(1);
  // }
  return `https://docs.ascender-automation.org`;
}
