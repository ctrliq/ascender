import type { Host } from 'types/api';
import React from 'react';
import { screen } from '@testing-library/react';
import { HostsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryHostFacts from './InventoryHostFacts';
import mockHost from '../shared/data.host.json';
import mockHostFacts from '../shared/data.hostFacts.json';

vi.mock('../../../api');

describe('<InventoryHostFacts />', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    vi.mocked(HostsAPI.readFacts).mockResolvedValue({
      data: mockHostFacts,
    } as unknown as ResponseOf<typeof HostsAPI.readFacts>);
    renderWithContexts(
      <InventoryHostFacts host={mockHost as unknown as Host} />
    );
    expect(await screen.findByText('Facts')).toBeInTheDocument();
  });

  test('renders ContentError when facts GET fails', async () => {
    vi.mocked(HostsAPI.readFacts).mockRejectedValueOnce(new Error());
    renderWithContexts(
      <InventoryHostFacts host={mockHost as unknown as Host} />
    );
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });
});
