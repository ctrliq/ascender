import { useQuery } from '@tanstack/react-query';

import { HostsAPI } from 'api';

/**
 * A host's facts, as the JSON text the variables editor shows.
 *
 * Two screens read this, Hosts and the host inside an Inventory, and both used
 * to fetch it themselves through useRequest. Asking for it here means the two
 * of them share one request and one cache entry instead of making the same
 * call twice.
 */
export default function useHostFacts(hostId: number) {
  return useQuery({
    queryKey: ['host', hostId, 'facts'],
    queryFn: async () => {
      const { data } = await HostsAPI.readFacts(hostId);
      return JSON.stringify(data, null, 4);
    },
  });
}
