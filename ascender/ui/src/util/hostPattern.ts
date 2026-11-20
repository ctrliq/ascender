/**
 * The Ansible host pattern that names exactly these hosts or groups.
 *
 * Names are joined with commas, never colons: Ansible splits a pattern on
 * commas wherever it holds one, and a colon is part of an IPv6 address or a
 * host:port name. A pattern without a comma is read differently, though: one
 * that does not parse as a single address is split on its colons, so a lone
 * name such as `db:primary` would become two patterns, `db` and `primary`.
 * A trailing comma makes such a name a list of one, which Ansible reads whole
 * and whose empty last entry it drops.
 *
 * Args:
 *     names: The host or group names, in the order they should appear.
 *
 * Returns:
 *     The pattern, or an empty string where there are no names.
 */
export default function toHostPattern(
  names: (string | null | undefined)[]
): string {
  const kept = names
    .map((name) => (name ?? '').trim())
    .filter((name) => name !== '');
  const pattern = kept.join(',');
  return kept.length === 1 && pattern.includes(':') ? `${pattern},` : pattern;
}
