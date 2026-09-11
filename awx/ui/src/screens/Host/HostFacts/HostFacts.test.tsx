import type { Untyped } from 'types/api';
import type { ApiResponse } from 'api/Base';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { HostsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import HostFacts from './HostFacts';
import mockHost from '../data.host.json';
import mockHostFacts from '../data.hostFacts.json';
import type { Host } from 'types/api';

vi.mock('../../../api/models/Hosts');
vi.mock('react-router', async () => ({
  ...(await vi.importActual<typeof import('react-router')>('react-router')),
  useParams: () => ({
    id: 1,
    hostId: 1,
  }),
}));

describe('<HostFacts />', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    vi.mocked(HostsAPI.readFacts).mockResolvedValue({
      data: mockHostFacts,
    } as unknown as ApiResponse<Untyped>);
    renderWithContexts(<HostFacts host={mockHost as unknown as Host} />);
    // react-ace renders empty under jsdom, so assert the Facts detail label
    // rather than the JSON body
    expect(await screen.findByText('Facts')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    expect(HostsAPI.readFacts).toHaveBeenCalledWith(mockHost.id);
  });

  test('renders ContentError when facts GET fails', async () => {
    vi.mocked(HostsAPI.readFacts).mockRejectedValueOnce(
      Object.assign(new Error('An error occurred'), {
        response: {
          config: {
            method: 'get',
            url: '/api/v2/hosts/1/ansible_facts',
          },
          data: 'An error occurred',
          status: 500,
        },
      })
    );
    renderWithContexts(<HostFacts host={mockHost as unknown as Host} />);
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });
});
