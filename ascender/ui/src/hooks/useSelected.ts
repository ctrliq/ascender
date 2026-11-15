import { useEffect, useState, useCallback } from 'react';

/**
 * useSelected hook provides a way to read and update a selected list
 * Param: array of list items
 * Returns: {
 *  selected: array of selected list items
 *  isAllSelected: boolean that indicates if all items are selected
 *  handleSelect: function that adds and removes items from selected list
 *  setSelected: setter function
 *  clearSelected: de-select all items
 * }
 */

/** The only thing a selectable row needs, so the only thing this requires. */
export interface Selectable {
  /** Optional because a row is only selectable once the api has given it one. */
  id?: number | string;
}

export default function useSelected<T extends Selectable>(
  list: T[] = [],
  defaultSelected: T[] = [],
  prune = false
) {
  const [selected, setSelected] = useState<T[]>(defaultSelected);
  const isAllSelected = selected.length > 0 && selected.length === list.length;

  useEffect(() => {
    if (!prune) return;
    // After a refetch a selected row can leave the page or become a stack row.
    // Keep the selection to rows that are still selectable and re-point the
    // entries at the current row objects so bulk actions see fresh status and
    // capabilities.  Return the same array when nothing changed, because
    // callers often pass a freshly filtered list on every render and an
    // unconditional update would loop.
    setSelected((prev) => {
      const byId = new Map(list.map((item) => [item.id, item]));
      const next = prev
        .map((row) => byId.get(row.id))
        .filter((row): row is T => Boolean(row));
      const unchanged =
        next.length === prev.length &&
        next.every((row, index) => row === prev[index]);
      return unchanged ? prev : next;
    });
  }, [list, prune]);

  const handleSelect = (row: T) => {
    if (!row.id) {
      throw new Error(`Selected row does not have an id`);
    }
    if (selected.some((s) => s.id === row.id)) {
      setSelected((prevState) => [...prevState.filter((i) => i.id !== row.id)]);
    } else {
      setSelected((prevState) => [...prevState, row]);
    }
  };

  const selectAll = useCallback(
    (isSelected: boolean) => {
      setSelected(isSelected ? [...list] : []);
    },
    [list]
  );

  const clearSelected = useCallback(() => {
    setSelected([]);
  }, []);

  return {
    selected,
    isAllSelected,
    handleSelect,
    setSelected,
    selectAll,
    clearSelected,
  };
}
