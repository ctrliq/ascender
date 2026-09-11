import { useState, useCallback } from 'react';

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
interface Selectable {
  /** Optional because a row is only selectable once the api has given it one. */
  id?: number | string;
}

export default function useSelected<T extends Selectable>(
  list: T[] = [],
  defaultSelected: T[] = []
) {
  const [selected, setSelected] = useState<T[]>(defaultSelected);
  const isAllSelected = selected.length > 0 && selected.length === list.length;

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
