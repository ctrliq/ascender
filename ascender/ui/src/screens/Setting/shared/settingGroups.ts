import type { MessageDescriptor } from '@lingui/core';

/**
 * One tab of a settings screen: the settings it holds, under a name.
 *
 * Every screen that splits its category into tabs does it the same way: each
 * group has an address of its own under the screen's, the tab bar links those
 * addresses, and the edit form shows and saves one group at a time. Keeping the
 * label here, beside the keys, is what lets the detail view, the edit view and
 * the breadcrumbs read one name for the tab rather than three copies of it.
 */
export interface SettingGroup {
  id: string;
  /** What the tab for this group says, and the crumb for its address. */
  label: MessageDescriptor;
  keys: string[];
}

/**
 * The group a path names, or the first one where it names none.
 *
 * Args:
 *   groups: The screen's groups, in tab order.
 *   pathname: The current address.
 *
 * Returns:
 *   The group whose id ends the address, or the first group.
 */
export function groupFromPath<G extends SettingGroup>(
  groups: G[],
  pathname: string
): G {
  const named = groups.find(({ id }) => pathname.endsWith(`/${id}`));
  return named ?? (groups[0] as G);
}

/**
 * What a save of one tab sends: the group's own settings and nothing else.
 *
 * The form holds every setting of the category so that a field on one tab can
 * read another's value, but a save of one tab that sent the others with it
 * rewrote settings nobody touched, put back a value another admin changed
 * meanwhile, and carried secrets such as the aggregator password along.
 *
 * Args:
 *   values: The form's values, after any formatting the api needs.
 *   keys: The group's settings.
 *
 * Returns:
 *   The values of the group's settings that the form holds.
 */
export function pickGroup(
  values: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> {
  return Object.fromEntries(
    keys.filter((key) => key in values).map((key) => [key, values[key]])
  );
}

/**
 * The breadcrumbs of a screen whose tabs are addresses.
 *
 * A tab is a group of the screen's own settings rather than a page of its own,
 * so the screen keeps its name as the title whichever tab is open. The name
 * sits on the tab's address, and the root names nothing while a tab is open,
 * or the screen would be its own crumb.
 *
 * Args:
 *   baseURL: The screen's address.
 *   groups: The screen's groups.
 *   pathname: The current address.
 *   title: The screen's name.
 *   editTitle: The name of its edit form.
 *
 * Returns:
 *   The breadcrumb configuration SettingsPage takes.
 */
export function groupBreadcrumbs(
  baseURL: string,
  groups: SettingGroup[],
  pathname: string,
  title: string,
  editTitle: string
): Record<string, string | null> {
  const onGroup = groups.some(({ id }) => pathname === `${baseURL}/${id}`);
  return {
    [baseURL]: onGroup ? null : title,
    [`${baseURL}/details`]: null,
    ...Object.fromEntries(groups.map(({ id }) => [`${baseURL}/${id}`, title])),
    [`${baseURL}/edit`]: null,
    ...Object.fromEntries(
      groups.map(({ id }) => [`${baseURL}/edit/${id}`, editTitle])
    ),
  };
}
