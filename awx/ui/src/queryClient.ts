import { QueryClient } from '@tanstack/react-query';

/**
 * How long a read stays fresh before the next component asking for it goes
 * back to the API. Thirty seconds is short enough that a screen reopened after
 * a change shows it, and long enough that two components mounting together, or
 * a tab switched away and back, share one request rather than making two.
 */
const STALE_TIME = 30_000;

/**
 * The cache the UI's reads share.
 *
 * Built once and exported, rather than made inside a component, so that a
 * re-render never throws the cache away. Tests make their own with retries off,
 * because a test that fails should say so at once rather than three times.
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME,
        // The API is the source of truth for a screen that is open, but
        // refetching on every window focus is a request storm on a wall
        // display, which is how a lot of these screens are used.
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

const queryClient = makeQueryClient();

export default queryClient;
