import type { ApiResponse } from 'api/Base';
import type { Untyped } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { ConstructedInventoriesAPI, InventoriesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ConstructedInventoryAdd from './ConstructedInventoryAdd';

vi.mock('../../../api');

const formData = {
  name: 'Mock',
  description: 'Foo',
  organization: { id: 1 },
  kind: 'constructed',
  source_vars: 'plugin: constructed',
  inputInventories: [{ id: 2 }],
  instanceGroups: [],
};

vi.mock('../shared/ConstructedInventoryForm', () => ({
  default: function ConstructedInventoryForm({
    onSubmit,
    onCancel,
    submitError,
  }: Untyped) {
    return (
      <div>
        <button
          type="button"
          aria-label="mock-submit"
          onClick={() => onSubmit(formData)}
        />
        <button type="button" aria-label="mock-cancel" onClick={onCancel} />
        {submitError ? <div data-testid="mock-submit-error" /> : null}
      </div>
    );
  },
}));

describe('<ConstructedInventoryAdd />', () => {
  beforeEach(() => {
    vi.mocked(ConstructedInventoriesAPI.readOptions).mockResolvedValue({
      data: {
        related: {},
        actions: {
          POST: {
            limit: { label: 'Limit', help_text: '' },
            update_cache_timeout: {
              label: 'Update cache timeout',
              help_text: 'help',
            },
            verbosity: { label: 'Verbosity', help_text: '' },
          },
        },
      },
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(ConstructedInventoriesAPI.create).mockResolvedValue({
      data: { id: 1 },
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(InventoriesAPI.associateInventory).mockResolvedValue(
      undefined as unknown as ApiResponse<any>
    );
    vi.mocked(InventoriesAPI.associateInstanceGroup).mockResolvedValue(
      undefined as unknown as ApiResponse<any>
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should navigate to inventories list on cancel', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/inventories/constructed_inventory/add'],
    });
    const { user } = renderWithContexts(<ConstructedInventoryAdd />, {
      context: { router: { history } },
    });
    await user.click(
      await screen.findByRole('button', { name: 'mock-cancel' })
    );

    expect(history.location.pathname).toEqual('/inventories');
  });

  test('should navigate to constructed inventory detail after successful submission', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/inventories/constructed_inventory/add'],
    });
    const { user } = renderWithContexts(<ConstructedInventoryAdd />, {
      context: { router: { history } },
    });
    await user.click(
      await screen.findByRole('button', { name: 'mock-submit' })
    );

    await waitFor(() =>
      expect(history.location.pathname).toBe(
        '/inventories/constructed_inventory/1/details'
      )
    );
  });

  test('should make expected api requests on submit', async () => {
    const { user } = renderWithContexts(<ConstructedInventoryAdd />);
    await user.click(
      await screen.findByRole('button', { name: 'mock-submit' })
    );

    await waitFor(() =>
      expect(ConstructedInventoriesAPI.create).toHaveBeenCalledTimes(1)
    );
    expect(InventoriesAPI.associateInventory).toHaveBeenCalledTimes(1);
    expect(InventoriesAPI.associateInventory).toHaveBeenCalledWith(1, 2);
    expect(InventoriesAPI.associateInstanceGroup).not.toHaveBeenCalled();
  });

  test('unsuccessful form submission should show an error message', async () => {
    vi.mocked(ConstructedInventoriesAPI.create).mockRejectedValueOnce(
      new Error('boom')
    );
    const { user } = renderWithContexts(<ConstructedInventoryAdd />);
    await user.click(
      await screen.findByRole('button', { name: 'mock-submit' })
    );

    expect(await screen.findByTestId('mock-submit-error')).toBeInTheDocument();
  });
});
