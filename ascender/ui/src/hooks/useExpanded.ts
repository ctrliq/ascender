import { useEffect, useState, useCallback } from 'react';

/** The only thing an expandable row needs, so the only thing this requires. */
export interface Expandable {
  id: number | string;
}

export default function useExpanded<T extends Expandable>(
  list: T[] = [],
  getKey: (row: T) => string | number = (row) => row.id,
  prune = false
) {
  const [expanded, setExpanded] = useState<T[]>([]);
  const expandedKeys = new Set(expanded.map(getKey));
  const isAllExpanded =
    list.length > 0 && list.every((row) => expandedKeys.has(getKey(row)));

  useEffect(() => {
    if (!prune) return;
    // A row can leave the page after a refetch.  Keep the expanded set to the
    // rows that are still present so expand-all stays accurate.  Re-point the
    // entries at the current row objects so the expanded content is fresh.
    setExpanded((prev) => {
      const byKey = new Map(list.map((row) => [getKey(row), row]));
      const next = prev
        .map((row) => byKey.get(getKey(row)))
        .filter((row): row is T => Boolean(row));
      const unchanged =
        next.length === prev.length &&
        next.every((row, index) => row === prev[index]);
      return unchanged ? prev : next;
    });
  }, [list, getKey, prune]);

  const handleExpand = (row: T) => {
    const key = getKey(row);
    if (expanded.some((s) => getKey(s) === key)) {
      setExpanded((prevState) => prevState.filter((i) => getKey(i) !== key));
    } else {
      setExpanded((prevState) => [...prevState, row]);
    }
  };

  const expandAll = useCallback(
    (isExpanded: boolean) => {
      setExpanded(isExpanded ? [...list] : []);
    },
    [list]
  );

  return {
    expanded,
    isAllExpanded,
    handleExpand,
    setExpanded,
    expandAll,
  };
}
