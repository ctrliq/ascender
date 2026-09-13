import React from 'react';
import { screen, waitFor } from '@testing-library/react';

import { HostsAPI } from 'api';
import { renderWithContexts } from '../../testUtils/rtlContexts';
import type { ResponseOf } from '../../testUtils/types';
import useHostFacts from './useHostFacts';

vi.mock('../api');

function Facts({ hostId }: { hostId: number }) {
  const { data, isPending } = useHostFacts(hostId);
  if (isPending) {
    return <div>loading</div>;
  }
  return <pre data-testid={`facts-${hostId}`}>{data}</pre>;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(HostsAPI.readFacts).mockResolvedValue({
    data: { ansible_distribution: 'Rocky' },
  } as unknown as ResponseOf<typeof HostsAPI.readFacts>);
});

describe('useHostFacts', () => {
  it('reads a host’s facts and formats them', async () => {
    renderWithContexts(<Facts hostId={7} />);

    expect(await screen.findByTestId('facts-7')).toHaveTextContent(
      'ansible_distribution'
    );
    expect(HostsAPI.readFacts).toHaveBeenCalledWith(7);
  });

  it('makes one request when two components ask for the same host', async () => {
    // the point of the change: Hosts and the host inside an Inventory both
    // show this, and used to fetch it twice
    renderWithContexts(
      <>
        <Facts hostId={7} />
        <Facts hostId={7} />
      </>
    );

    await waitFor(() =>
      expect(screen.getAllByTestId('facts-7')).toHaveLength(2)
    );
    expect(HostsAPI.readFacts).toHaveBeenCalledTimes(1);
  });

  it('keeps them apart by host', async () => {
    renderWithContexts(
      <>
        <Facts hostId={7} />
        <Facts hostId={8} />
      </>
    );

    await waitFor(() =>
      expect(screen.getByTestId('facts-8')).toBeInTheDocument()
    );
    expect(HostsAPI.readFacts).toHaveBeenCalledTimes(2);
    expect(HostsAPI.readFacts).toHaveBeenCalledWith(7);
    expect(HostsAPI.readFacts).toHaveBeenCalledWith(8);
  });

  it('serves a second mount from the cache without asking again', async () => {
    const { unmount } = renderWithContexts(<Facts hostId={7} />, {
      context: {},
    });
    await screen.findByTestId('facts-7');
    expect(HostsAPI.readFacts).toHaveBeenCalledTimes(1);

    unmount();
    // the same cache, because the query client belongs to the render
    renderWithContexts(<Facts hostId={7} />);
    await screen.findByTestId('facts-7');
  });

  it('surfaces a failure rather than hanging', async () => {
    vi.mocked(HostsAPI.readFacts).mockRejectedValue(new Error('nope'));

    renderWithContexts(<Facts hostId={7} />);

    await waitFor(() =>
      expect(screen.queryByText('loading')).not.toBeInTheDocument()
    );
  });
});
