import { QueryClient } from '@tanstack/react-query';

/**
 * The cache the OPTIONS requests share.
 *
 * Its own client rather than the one the components use. The two have nothing
 * to say to each other: this one is keyed by URL and lives at the transport,
 * below React, while the component cache is keyed by what a screen asked for
 * and is tied to a mounted tree. Keeping them apart also means a test that
 * empties this one cannot cancel a query some component is waiting on.
 */
const optionsClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The same thirty seconds every other read gets. Not longer, even though
      // an endpoint's shape does not change: the `actions` OPTIONS carries
      // depend on what the current user may do, and a role granted while they
      // are looking should not need a reload to show up.
      staleTime: 30_000,
      // A failing OPTIONS call already surfaces on the screen that asked for
      // it. Retrying only doubles the wait before it says so.
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Read an OPTIONS payload through the cache.
 *
 * OPTIONS is the one read the UI makes over and over for the same answer: it
 * describes an endpoint rather than any row in it, so every list screen asks
 * for it on every mount, nearly always in the same `Promise.all` as the list
 * read beside it.
 */
export async function cachedOptions<T>(
  queryKey: readonly unknown[],
  fetch: () => Promise<T>
): Promise<T> {
  // Boxed, because the cache refuses to store undefined and a transport that
  // resolves to nothing is something a caller is allowed to hand us. Without
  // the box that caller would start throwing where it used to get undefined.
  const { value } = await optionsClient.fetchQuery({
    queryKey,
    queryFn: async () => ({ value: await fetch() }),
  });
  return value;
}

/** Empty it, which the test setup does between tests. */
export function clearOptionsCache() {
  optionsClient.clear();
}

export default cachedOptions;
