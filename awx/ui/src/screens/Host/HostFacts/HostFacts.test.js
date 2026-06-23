import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { HostsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import HostFacts from './HostFacts';
import mockHost from '../data.host.json';
import mockHostFacts from '../data.hostFacts.json';

jest.mock('../../../api/models/Hosts');
jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useParams: () => ({
    id: 1,
    hostId: 1,
  }),
}));

describe('<HostFacts />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    HostsAPI.readFacts.mockResolvedValue({ data: mockHostFacts });
    renderWithContexts(<HostFacts host={mockHost} />);
    // react-ace renders empty under jsdom, so assert the Facts detail label
    // rather than the JSON body
    expect(await screen.findByText('Facts')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    expect(HostsAPI.readFacts).toHaveBeenCalledWith(mockHost.id);
  });

  test('renders ContentError when facts GET fails', async () => {
    HostsAPI.readFacts.mockRejectedValueOnce(
      new Error({
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
    renderWithContexts(<HostFacts host={mockHost} />);
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });
});
