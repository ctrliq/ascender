import type { SummaryFieldRef } from 'types/api';
import { useCallback, useRef } from 'react';

/**
 * useAutoPopulateLookup hook [... insert description]
 * Param: [... insert params]
 * Returns: {
 *  [... insert returns]
 * }
 */

export default function useAutoPopulateLookup(
  populateLookupField: (value: SummaryFieldRef) => void
) {
  const isFirst = useRef(true);

  return useCallback(
    (results: SummaryFieldRef[]) => {
      const only = results[0];
      if (isFirst.current && results.length === 1 && only) {
        populateLookupField(only);
      }

      isFirst.current = false;
    },
    [populateLookupField]
  );
}
