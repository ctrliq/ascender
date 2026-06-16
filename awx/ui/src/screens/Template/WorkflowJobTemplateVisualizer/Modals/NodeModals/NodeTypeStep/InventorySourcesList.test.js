import React from 'react';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { InventorySourcesAPI } from 'api';
import { renderWithContexts } from '../../../../../../../testUtils/rtlContexts';
import InventorySourcesList from './InventorySourcesList';

jest.mock('../../../../../../api/models/InventorySources');

const nodeResource = {
  id: 1,
  name: 'Test Inventory Source',
  unified_job_type: 'workflow_approval',
};
const onUpdateNodeResource = jest.fn();

describe('InventorySourcesList', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Row selected when nodeResource id matches row id and clicking new row makes expected callback', async () => {
    InventorySourcesAPI.read.mockResolvedValueOnce({
      data: {
        count: 2,
        results: [
          {
            id: 1,
            name: 'Test Inventory Source',
            type: 'inventory_source',
            url: '/api/v2/inventory_sources/1',
          },
          {
            id: 2,
            name: 'Test Inventory Source 2',
            type: 'inventory_source',
            url: '/api/v2/inventory_sources/2',
          },
        ],
      },
    });
    InventorySourcesAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
    renderWithContexts(
      <InventorySourcesList
        nodeResource={nodeResource}
        onUpdateNodeResource={onUpdateNodeResource}
      />
    );

    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );

    const row1 = screen.getByRole('row', { name: /Test Inventory Source$/ });
    const row2 = screen.getByRole('row', { name: /Test Inventory Source 2/ });
    expect(within(row1).getByRole('radio')).toBeChecked();
    expect(within(row2).getByRole('radio')).not.toBeChecked();

    fireEvent.click(within(row2).getByRole('radio'));
    expect(onUpdateNodeResource).toHaveBeenCalledWith({
      id: 2,
      name: 'Test Inventory Source 2',
      type: 'inventory_source',
      url: '/api/v2/inventory_sources/2',
    });
  });

  test('Error shown when read() request errors', async () => {
    InventorySourcesAPI.read.mockRejectedValue(new Error());
    renderWithContexts(
      <InventorySourcesList
        nodeResource={nodeResource}
        onUpdateNodeResource={onUpdateNodeResource}
      />
    );

    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
  });
});
