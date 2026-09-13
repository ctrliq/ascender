/* eslint-disable import-x/prefer-default-export */

/** The only thing this compares by, so the only thing it needs to know about. */
interface Identifiable {
  id: number | string;
}

export function getAddedAndRemoved<T extends Identifiable>(
  original?: readonly T[] | null,
  current?: readonly T[] | null
): { added: T[]; removed: T[] } {
  const before = original || [];
  const after = current || [];
  const added: T[] = [];
  const removed: T[] = [];
  before.forEach((orig) => {
    if (!after.find((cur) => cur.id === orig.id)) {
      removed.push(orig);
    }
  });
  after.forEach((cur) => {
    if (!before.find((orig) => orig.id === cur.id)) {
      added.push(cur);
    }
  });
  return { added, removed };
}
