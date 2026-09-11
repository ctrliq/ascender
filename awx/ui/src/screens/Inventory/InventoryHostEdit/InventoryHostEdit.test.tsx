import type { ApiResponse } from 'api/Base';
import type { Untyped, Host, Inventory } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { HostsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryHostEdit from './InventoryHostEdit';
import mockHost from '../shared/data.host.json';

vi.mock('../../../api');

const updatedHostData = {
  name: 'new name',
  description: 'new description',
  variables: '---\nfoo: bar',
};

vi.mock('components/HostForm', () => ({
  default: ({ handleSubmit, handleCancel, submitError }: Untyped) => (
    <div>
      <button
        type="button"
        aria-label="mock-submit"
        onClick={() => handleSubmit(updatedHostData)}
      />
      <button type="button" aria-label="mock-cancel" onClick={handleCancel} />
      {submitError ? <div aria-label="mock-submit-error" /> : null}
    </div>
  ),
}));

describe('<InventoryHostEdit />', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('handleSubmit should call api update', async () => {
    vi.mocked(HostsAPI.update).mockResolvedValue(
      {} as unknown as ApiResponse<Untyped>
    );
    const { user } = renderWithContexts(
      <InventoryHostEdit
        host={mockHost as unknown as Host}
        inventory={{ id: 123 } as unknown as Inventory}
      />
    );
    await user.click(screen.getByRole('button', { name: 'mock-submit' }));
    await waitFor(() =>
      expect(HostsAPI.update).toHaveBeenCalledWith(2, updatedHostData)
    );
  });

  test('should navigate to inventory host detail when cancel is clicked', async () => {
    const history = createMemoryHistory();
    const { user } = renderWithContexts(
      <InventoryHostEdit
        host={mockHost as unknown as Host}
        inventory={{ id: 123 } as unknown as Inventory}
      />,
      { context: { router: { history } } }
    );
    await user.click(screen.getByRole('button', { name: 'mock-cancel' }));
    expect(history.location.pathname).toEqual(
      '/inventories/inventory/123/hosts/2/details'
    );
  });

  test('should navigate to inventory host detail after successful submission', async () => {
    vi.mocked(HostsAPI.update).mockResolvedValue(
      {} as unknown as ApiResponse<Untyped>
    );
    const history = createMemoryHistory();
    const { user } = renderWithContexts(
      <InventoryHostEdit
        host={mockHost as unknown as Host}
        inventory={{ id: 123 } as unknown as Inventory}
      />,
      { context: { router: { history } } }
    );
    await user.click(screen.getByRole('button', { name: 'mock-submit' }));
    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/inventories/inventory/123/hosts/2/details'
      )
    );
    expect(
      screen.queryByLabelText('mock-submit-error')
    ).not.toBeInTheDocument();
  });

  test('failed form submission should show an error message', async () => {
    const error = {
      response: { data: { detail: 'An error occurred' } },
    };
    vi.mocked(HostsAPI.update).mockRejectedValueOnce(error);
    const { user } = renderWithContexts(
      <InventoryHostEdit
        host={mockHost as unknown as Host}
        inventory={{ id: 123 } as unknown as Inventory}
      />
    );
    await user.click(screen.getByRole('button', { name: 'mock-submit' }));
    expect(
      await screen.findByLabelText('mock-submit-error')
    ).toBeInTheDocument();
  });
});
