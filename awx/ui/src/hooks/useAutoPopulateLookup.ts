import { useCallback, useRef } from 'react';

/**
 * useAutoPopulateLookup hook [... insert description]
 * Param: [... insert params]
 * Returns: {
 *  [... insert returns]
 * }
 */

export default function useAutoPopulateLookup(
  populateLookupField: (value: unknown) => void
) {
  const isFirst = useRef(true);

  return useCallback(
    (results: { id: number }[]) => {
      if (isFirst.current && results.length === 1) {
        populateLookupField(results[0]);
      }

      isFirst.current = false;
    },
    [populateLookupField]
  );
}
