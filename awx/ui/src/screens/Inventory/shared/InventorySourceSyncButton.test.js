import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { InventorySourcesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventorySourceSyncButton from './InventorySourceSyncButton';

jest.mock('../../../api');

const source = { id: 1, name: 'Foo', source: 'Source Bar' };

describe('<InventorySourceSyncButton />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render start sync button', () => {
    const { container } = renderWithContexts(
      <InventorySourceSyncButton source={source} />
    );
    const button = screen.getByRole('button', { name: 'Start sync source' });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  test('should start sync properly', async () => {
    InventorySourcesAPI.createSyncStart.mockResolvedValue({
      data: { status: 'pending' },
    });
    const { user } = renderWithContexts(
      <InventorySourceSyncButton source={source} />
    );

    await user.click(screen.getByRole('button', { name: 'Start sync source' }));

    await waitFor(() =>
      expect(InventorySourcesAPI.createSyncStart).toHaveBeenCalledWith(1)
    );
  });

  test('should throw error on sync start properly', async () => {
    InventorySourcesAPI.createSyncStart.mockRejectedValueOnce(new Error());
    const { user } = renderWithContexts(
      <InventorySourceSyncButton source={source} />
    );

    await user.click(screen.getByRole('button', { name: 'Start sync source' }));

    expect(await screen.findByText('Error!')).toBeInTheDocument();
  });
});
