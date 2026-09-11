import type { ApiResponse } from 'api/Base';
import type { Untyped } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { InventoriesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import SmartInventoryEdit from './SmartInventoryEdit';
import mockSmartInventory from '../shared/data.smart_inventory.json';

vi.mock('../../../api');

const mockSmartInv = {
  ...mockSmartInventory,
  organization: {
    id: mockSmartInventory.organization,
  },
};

vi.mock('../shared/SmartInventoryForm', () => ({
  default: function SmartInventoryForm({
    onSubmit,
    onCancel,
    submitError,
  }: Untyped) {
    const mockSubmitValues = {
      name: 'Mock Smart',
      organization: { id: 1 },
      instance_groups: [
        { id: 10, name: 'instance-group-10' },
        { id: 30, name: 'instance-group-30' },
      ],
    };
    return (
      <div>
        <button
          type="button"
          aria-label="mock-submit"
          onClick={() => onSubmit(mockSubmitValues)}
        />
        <button type="button" aria-label="mock-cancel" onClick={onCancel} />
        {submitError ? <div data-testid="mock-submit-error" /> : null}
      </div>
    );
  },
}));

describe('<SmartInventoryEdit />', () => {
  beforeEach(() => {
    vi.mocked(InventoriesAPI.update).mockResolvedValue({
      data: mockSmartInv,
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(InventoriesAPI.orderInstanceGroups).mockResolvedValue(undefined);
    vi.mocked(InventoriesAPI.readInstanceGroups).mockResolvedValue({
      data: {
        count: 0,
        results: [
          { id: 10, name: 'instance-group-10' },
          { id: 20, name: 'instance-group-20' },
        ],
      },
    } as unknown as ApiResponse<Untyped>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should fetch related instance groups on initial render', async () => {
    renderWithContexts(<SmartInventoryEdit inventory={{ ...mockSmartInv }} />);
    expect(
      await screen.findByRole('button', { name: 'mock-submit' })
    ).toBeInTheDocument();
    expect(InventoriesAPI.readInstanceGroups).toHaveBeenCalledTimes(1);
  });

  test('should post to the api when submit is clicked', async () => {
    const { user } = renderWithContexts(
      <SmartInventoryEdit inventory={{ ...mockSmartInv }} />
    );
    await user.click(
      await screen.findByRole('button', { name: 'mock-submit' })
    );

    await waitFor(() => expect(InventoriesAPI.update).toHaveBeenCalledTimes(1));
    expect(InventoriesAPI.orderInstanceGroups).toHaveBeenCalledTimes(1);
  });

  test('successful form submission should trigger redirect to details', async () => {
    const history = createMemoryHistory({
      initialEntries: [`/inventories/smart_inventory/${mockSmartInv.id}/edit`],
    });
    const { user } = renderWithContexts(
      <SmartInventoryEdit inventory={{ ...mockSmartInv }} />,
      { context: { router: { history } } }
    );
    await user.click(
      await screen.findByRole('button', { name: 'mock-submit' })
    );

    await waitFor(() =>
      expect(history.location.pathname).toBe(
        `/inventories/smart_inventory/${mockSmartInv.id}/details`
      )
    );
  });

  test('should navigate to inventory details when cancel is clicked', async () => {
    const history = createMemoryHistory({
      initialEntries: [`/inventories/smart_inventory/${mockSmartInv.id}/edit`],
    });
    const { user } = renderWithContexts(
      <SmartInventoryEdit inventory={{ ...mockSmartInv }} />,
      { context: { router: { history } } }
    );
    await user.click(
      await screen.findByRole('button', { name: 'mock-cancel' })
    );

    expect(history.location.pathname).toEqual(
      `/inventories/smart_inventory/${mockSmartInv.id}/details`
    );
  });

  test('unsuccessful form submission should show an error message', async () => {
    vi.mocked(InventoriesAPI.update).mockRejectedValueOnce(new Error('boom'));
    const { user } = renderWithContexts(
      <SmartInventoryEdit inventory={{ ...mockSmartInv }} />
    );
    await user.click(
      await screen.findByRole('button', { name: 'mock-submit' })
    );

    expect(await screen.findByTestId('mock-submit-error')).toBeInTheDocument();
  });

  test('should throw content error', async () => {
    vi.mocked(InventoriesAPI.readInstanceGroups).mockRejectedValueOnce(
      new Error()
    );
    renderWithContexts(<SmartInventoryEdit inventory={{ ...mockSmartInv }} />);

    expect(
      await screen.findByText(/There was an error loading this content/i)
    ).toBeInTheDocument();
  });
});
