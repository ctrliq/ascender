import React from 'react';
import { screen } from '@testing-library/react';
import { HostsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryHostFacts from './InventoryHostFacts';
import mockHost from '../shared/data.host.json';
import mockHostFacts from '../shared/data.hostFacts.json';

jest.mock('../../../api');

describe('<InventoryHostFacts />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    HostsAPI.readFacts.mockResolvedValue({ data: mockHostFacts });
    renderWithContexts(<InventoryHostFacts host={mockHost} />);
    // react-ace renders empty under jsdom; assert the Facts label/container
    expect(await screen.findByText('Facts')).toBeInTheDocument();
  });

  test('renders ContentError when facts GET fails', async () => {
    HostsAPI.readFacts.mockRejectedValueOnce(new Error());
    renderWithContexts(<InventoryHostFacts host={mockHost} />);
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });
});
