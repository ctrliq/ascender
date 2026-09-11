import { useState, useCallback } from 'react';

/** The only thing an expandable row needs, so the only thing this requires. */
interface Expandable {
  id: number | string;
}

export default function useExpanded<T extends Expandable>(list: T[] = []) {
  const [expanded, setExpanded] = useState<T[]>([]);
  const isAllExpanded = expanded.length > 0 && expanded.length === list.length;

  const handleExpand = (row: T) => {
    if (!row.id) {
      throw new Error(`Selected row does not have an id`);
    }
    if (expanded.some((s) => s.id === row.id)) {
      setExpanded((prevState) => [...prevState.filter((i) => i.id !== row.id)]);
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
