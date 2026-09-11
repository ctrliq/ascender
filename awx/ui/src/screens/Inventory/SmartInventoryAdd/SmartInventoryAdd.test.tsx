import type { ApiResponse } from 'api/Base';
import type { Untyped } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { InventoriesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import SmartInventoryAdd from './SmartInventoryAdd';

vi.mock('../../../api');

const formData = {
  name: 'Mock',
  description: 'Foo',
  organization: { id: 1 },
  kind: 'smart',
  host_filter: 'name__icontains=mock',
  variables: '---',
  instance_groups: [{ id: 2 }],
};

vi.mock('../shared/SmartInventoryForm', () => ({
  default: function SmartInventoryForm({
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

describe('<SmartInventoryAdd />', () => {
  beforeEach(() => {
    vi.mocked(InventoriesAPI.create).mockResolvedValue({
      data: { id: 1 },
    } as unknown as ResponseOf<typeof InventoriesAPI.create>);
    vi.mocked(InventoriesAPI.associateInstanceGroup).mockResolvedValue(
      undefined as unknown as ApiResponse<any>
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('initially renders successfully', () => {
    renderWithContexts(<SmartInventoryAdd />);
    expect(
      screen.getByRole('button', { name: 'mock-submit' })
    ).toBeInTheDocument();
  });

  test('should post to the api when submit is clicked', async () => {
    const { user } = renderWithContexts(<SmartInventoryAdd />);

    await user.click(screen.getByRole('button', { name: 'mock-submit' }));

    const { instance_groups, ...formRequest } = formData;
    await waitFor(() => expect(InventoriesAPI.create).toHaveBeenCalledTimes(1));
    expect(InventoriesAPI.create).toHaveBeenCalledWith({
      ...formRequest,
      organization: formRequest.organization.id,
    });
    await waitFor(() =>
      expect(InventoriesAPI.associateInstanceGroup).toHaveBeenCalledWith(1, 2)
    );
    expect(InventoriesAPI.associateInstanceGroup).toHaveBeenCalledTimes(1);
  });

  test('successful form submission should trigger redirect to details', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/inventories/smart_inventory/add'],
    });
    const { user } = renderWithContexts(<SmartInventoryAdd />, {
      context: { router: { history } },
    });

    await user.click(screen.getByRole('button', { name: 'mock-submit' }));

    await waitFor(() =>
      expect(history.location.pathname).toBe(
        '/inventories/smart_inventory/1/details'
      )
    );
  });

  test('should navigate to inventory list when cancel is clicked', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/inventories/smart_inventory/add'],
    });
    const { user } = renderWithContexts(<SmartInventoryAdd />, {
      context: { router: { history } },
    });

    await user.click(screen.getByRole('button', { name: 'mock-cancel' }));

    expect(history.location.pathname).toEqual('/inventories');
  });

  test('unsuccessful form submission should show an error message', async () => {
    vi.mocked(InventoriesAPI.create).mockRejectedValueOnce(new Error('boom'));
    const { user } = renderWithContexts(<SmartInventoryAdd />);

    await user.click(screen.getByRole('button', { name: 'mock-submit' }));

    expect(await screen.findByTestId('mock-submit-error')).toBeInTheDocument();
  });
});
