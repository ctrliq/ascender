import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { HostMetricsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import HostMetrics from './HostMetrics';

jest.mock('../../api');

const mockHostMetrics = [
  {
    hostname: 'Host name',
    first_automation: 'now',
    last_automation: 'now',
    automated_counter: 1,
    used_in_inventories: 1,
    deleted_counter: 1,
    id: 1,
    url: '',
  },
];

describe('<HostMetrics />', () => {
  beforeEach(() => {
    HostMetricsAPI.read.mockResolvedValue({
      data: {
        count: mockHostMetrics.length,
        results: mockHostMetrics,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    renderWithContexts(<HostMetrics />);
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
  });

  test('HostMetrics are retrieved from the api and the components finishes loading', async () => {
    renderWithContexts(<HostMetrics />);
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );

    expect(HostMetricsAPI.read).toHaveBeenCalled();
    expect(screen.getByText('Host name')).toBeInTheDocument();
    expect(screen.getAllByRole('cell', { name: 'Host name' })).toHaveLength(1);
  });
});
