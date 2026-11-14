/**
 * Which groups of the sidebar the person left closed.
 *
 * The rail is eight groups deep, so closing the ones somebody never opens is
 * how they keep the rest in reach: reopening them on every page load undoes
 * that. Held per browser, in local storage, because it is a preference about
 * this screen rather than anything the account or the API knows.
 */
const STORAGE_KEY = 'ascender.nav.collapsedGroups';

/**
 * The ids of the groups that are closed.
 *
 * Returns:
 *     The stored ids, or an empty list where nothing is stored and where the
 *     browser refuses storage, which is what a private window does.
 */
function readCollapsed(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(stored) ? (stored as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Whether a group should render open.
 *
 * Args:
 *     groupId: The group to ask about.
 *
 * Returns:
 *     False only where the person closed it, so a rail nobody has touched, and
 *     a browser that refuses storage, open everything.
 */
export function isGroupExpanded(groupId: string): boolean {
  return !readCollapsed().includes(groupId);
}

/**
 * Remembers that a group was opened or closed.
 *
 * Args:
 *     groupId: The group that was toggled.
 *     isExpanded: Whether it is now open.
 */
export function setGroupExpanded(groupId: string, isExpanded: boolean): void {
  const collapsed = readCollapsed().filter((id) => id !== groupId);
  if (!isExpanded) {
    collapsed.push(groupId);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsed));
  } catch {
    // A browser that refuses storage simply forgets, which is no worse than
    // the rail behaved before it remembered anything.
  }
}
