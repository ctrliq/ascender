import { useCallback, useMemo, useRef } from 'react';
import { hashKey, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';

import type { InitialResult, UseRequest } from './useRequest';

/**
 * useRequest, answered from the query cache.
 *
 * The five values are the same ones useRequest returns and every caller
 * destructures, so a screen moves across by naming what it is reading rather
 * than by changing shape:
 *
 *     const { result, error, isLoading, request, setValue } = useCachedRequest(
 *       ['projects', location.search],
 *       useCallback(async () => { ... }, [location]),
 *       { results: [], itemCount: 0 }
 *     );
 *
 * What changes is only what happens on mount. A screen that has been open in
 * the last thirty seconds is served from the cache instead of going back to
 * the API, which is the whole point of moving.
 *
 * What does not change is refreshing. `request()` still means "read it again
 * now": it drops the cached answer and refetches, so the paths that already
 * call it after a delete or an edit keep working exactly as they did. That
 * matters more than the caching does, because a list left stale after a delete
 * is a bug a user sees and a test does not.
 */
export default function useCachedRequest<T>(
  queryKey: QueryKey,
  makeRequest: () => Promise<T>,
  initialValue: InitialResult<T>
): UseRequest<T, []> {
  const queryClient = useQueryClient();

  // A caller writes its key inline, so the array is new on every render even
  // when it says the same thing. Depending on the array directly gives request
  // and setValue a new identity each time, every effect holding one re-runs,
  // and the screen loops. The hash is what actually changed.
  const keyHash = hashKey(queryKey);
  const keyRef = useRef(queryKey);
  keyRef.current = queryKey;

  // Same for the fallback value: held from the first render so that result does
  // not become a different object on every one before the read lands.
  const initialRef = useRef(initialValue);

  const query = useQuery({
    queryKey,
    queryFn: makeRequest,
  });

  /** Read it again now, discarding whatever the cache holds for this key. */
  const request = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: keyRef.current,
      exact: true,
    });
  }, [queryClient, keyHash]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Put a value in directly, which is how a screen applies something it already
   * knows: a websocket telling it one row's status changed, say, where going
   * back to the API for the whole page would be wasteful.
   */
  const setValue = useCallback(
    (value: React.SetStateAction<T>) => {
      queryClient.setQueryData(keyRef.current, (previous: T | undefined) =>
        typeof value === 'function'
          ? (value as (p: T | undefined) => T)(previous)
          : value
      );
    },
    [queryClient, keyHash] // eslint-disable-line react-hooks/exhaustive-deps
  ) as React.Dispatch<React.SetStateAction<T>>;

  const result = useMemo(
    () => (query.data === undefined ? (initialRef.current as T) : query.data),
    [query.data]
  );

  return {
    result,
    error: query.error ?? null,
    // useRequest counts the first read as loading and a refetch as not, so that
    // a list keeps its rows on screen while it refreshes rather than blanking.
    isLoading: query.isPending,
    request,
    setValue,
  };
}
