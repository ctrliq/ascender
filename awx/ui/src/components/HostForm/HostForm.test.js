import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { InventoriesAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import HostForm from './HostForm';

jest.mock('../../api');

const mockData = {
  id: 1,
  name: 'Foo',
  description: 'Bar',
  variables: '---',
  inventory: 1,
  summary_fields: {
    inventory: {
      id: 1,
      name: 'Test Inv',
    },
  },
};

describe('<HostForm />', () => {
  const handleSubmit = jest.fn();
  const handleCancel = jest.fn();

  beforeEach(() => {
    // the host already has a summary_fields.inventory, so the lookup does not
    // auto-populate; mock defensively so any stray read resolves quietly
    InventoriesAPI.read.mockResolvedValue({
      data: { count: 0, results: [] },
    });
    InventoriesAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {}, POST: {} }, related_search_fields: [] },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('changing inputs should update form values', async () => {
    const { user } = renderWithContexts(
      <HostForm
        host={mockData}
        handleSubmit={handleSubmit}
        handleCancel={handleCancel}
      />
    );

    // FormField labelIcon breaks getByLabelText, so query inputs by id
    const nameInput = document.querySelector('input#host-name');
    const descriptionInput = document.querySelector('input#host-description');

    await user.clear(nameInput);
    await user.type(nameInput, 'new foo');
    await user.clear(descriptionInput);
    await user.type(descriptionInput, 'new bar');

    expect(nameInput).toHaveValue('new foo');
    expect(descriptionInput).toHaveValue('new bar');
    // inventory lookup is enabled (not disabled) — its Search button is enabled
    expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled();
  });

  test('calls handleSubmit when form submitted', async () => {
    const { user } = renderWithContexts(
      <HostForm
        host={mockData}
        handleSubmit={handleSubmit}
        handleCancel={handleCancel}
      />
    );

    expect(handleSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(handleSubmit).toHaveBeenCalledTimes(1));
  });

  test('calls "handleCancel" when Cancel button is clicked', async () => {
    const { user } = renderWithContexts(
      <HostForm
        host={mockData}
        handleSubmit={handleSubmit}
        handleCancel={handleCancel}
      />
    );

    expect(handleCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  test('should hide inventory lookup field', async () => {
    renderWithContexts(
      <HostForm
        host={mockData}
        handleSubmit={jest.fn()}
        handleCancel={jest.fn()}
        isInventoryVisible={false}
      />
    );

    await screen.findByRole('button', { name: 'Save' });
    // with the lookup hidden there is no "Inventory" form group / Search button
    expect(screen.queryByText('Inventory')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Search' })
    ).not.toBeInTheDocument();
  });

  test('inventory lookup field should be disabled', async () => {
    renderWithContexts(
      <HostForm
        host={mockData}
        handleSubmit={jest.fn()}
        handleCancel={jest.fn()}
        disableInventoryLookup
      />
    );

    await screen.findByRole('button', { name: 'Save' });
    // disableInventoryLookup propagates to the lookup's Search button
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
  });
});
