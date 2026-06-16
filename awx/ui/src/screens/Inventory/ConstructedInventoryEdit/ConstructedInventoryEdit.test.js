import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { ConstructedInventoriesAPI, InventoriesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ConstructedInventoryEdit from './ConstructedInventoryEdit';

jest.mock('../../../api');

const mockInv = {
  name: 'Mock',
  id: 7,
  description: 'Foo',
  organization: { id: 1 },
  kind: 'constructed',
  source_vars: 'plugin: constructed',
  limit: 'product_dev',
};

const associatedInstanceGroups = [{ id: 1, name: 'Foo' }];
const associatedInputInventories = [
  { id: 123, name: 'input_inventory_123' },
  { id: 456, name: 'input_inventory_456' },
];

const mockFormValues = {
  kind: 'constructed',
  name: 'new constructed inventory',
  description: '',
  organization: { id: 1, name: 'mock organization' },
  instanceGroups: associatedInstanceGroups,
  source_vars: 'plugin: constructed',
  inputInventories: associatedInputInventories,
};

jest.mock(
  '../shared/ConstructedInventoryForm',
  () =>
    function ConstructedInventoryForm({ onSubmit, onCancel, submitError }) {
      return (
        <div>
          <button
            type="button"
            aria-label="mock-submit"
            onClick={() => onSubmit(mockFormValues)}
          />
          <button type="button" aria-label="mock-cancel" onClick={onCancel} />
          {submitError ? <div data-testid="mock-submit-error" /> : null}
        </div>
      );
    }
);

describe('<ConstructedInventoryEdit />', () => {
  beforeEach(() => {
    ConstructedInventoriesAPI.readConstructedInventoryOptions.mockResolvedValue({
      limit: { label: 'Limit', help_text: '' },
      update_cache_timeout: {
        label: 'Update cache timeout',
        help_text: 'help',
      },
      verbosity: { label: 'Verbosity', help_text: '' },
    });
    InventoriesAPI.readInstanceGroups.mockResolvedValue({
      data: { results: associatedInstanceGroups },
    });
    InventoriesAPI.readInputInventories.mockResolvedValue({
      data: { results: [{ id: 456, name: 'input_inventory_456' }] },
    });
    ConstructedInventoriesAPI.update.mockResolvedValue({ data: { id: 1 } });
    InventoriesAPI.orderInstanceGroups.mockResolvedValue();
    InventoriesAPI.disassociateInventory.mockResolvedValue();
    InventoriesAPI.associateInventory.mockResolvedValue();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should navigate to inventories details on cancel', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/inventories/constructed_inventory/7/edit'],
    });
    const { user } = renderWithContexts(
      <ConstructedInventoryEdit inventory={mockInv} />,
      { context: { router: { history } } }
    );
    await user.click(await screen.findByRole('button', { name: 'mock-cancel' }));

    expect(history.location.pathname).toEqual(
      '/inventories/constructed_inventory/7/details'
    );
  });

  test('should navigate to constructed inventory detail after successful submission', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/inventories/constructed_inventory/7/edit'],
    });
    const { user } = renderWithContexts(
      <ConstructedInventoryEdit inventory={mockInv} />,
      { context: { router: { history } } }
    );
    await user.click(await screen.findByRole('button', { name: 'mock-submit' }));

    await waitFor(() =>
      expect(history.location.pathname).toBe(
        '/inventories/constructed_inventory/7/details'
      )
    );
  });

  test('should make expected api requests on submit', async () => {
    const { user } = renderWithContexts(
      <ConstructedInventoryEdit inventory={mockInv} />
    );
    await user.click(await screen.findByRole('button', { name: 'mock-submit' }));

    await waitFor(() =>
      expect(ConstructedInventoriesAPI.update).toHaveBeenCalledTimes(1)
    );
    expect(InventoriesAPI.associateInstanceGroup).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(InventoriesAPI.disassociateInventory).toHaveBeenCalledTimes(1)
    );
    expect(InventoriesAPI.associateInventory).toHaveBeenCalledTimes(2);
    expect(InventoriesAPI.associateInventory).toHaveBeenNthCalledWith(1, 7, 123);
    expect(InventoriesAPI.associateInventory).toHaveBeenNthCalledWith(2, 7, 456);
  });

  test('should throw content error', async () => {
    InventoriesAPI.readInstanceGroups.mockRejectedValueOnce(new Error());
    renderWithContexts(<ConstructedInventoryEdit inventory={mockInv} />);

    expect(
      await screen.findByText(/There was an error loading this content/i)
    ).toBeInTheDocument();
  });

  test('should throw content error if user has insufficient options permissions', async () => {
    ConstructedInventoriesAPI.readConstructedInventoryOptions.mockRejectedValueOnce(
      new Error()
    );
    renderWithContexts(<ConstructedInventoryEdit inventory={mockInv} />);

    expect(
      await screen.findByText(/There was an error loading this content/i)
    ).toBeInTheDocument();
  });

  test('unsuccessful form submission should show an error message', async () => {
    ConstructedInventoriesAPI.update.mockRejectedValueOnce(new Error('boom'));
    const { user } = renderWithContexts(
      <ConstructedInventoryEdit inventory={mockInv} />
    );
    await user.click(await screen.findByRole('button', { name: 'mock-submit' }));

    expect(await screen.findByTestId('mock-submit-error')).toBeInTheDocument();
  });
});
