import type { ApiResponse } from 'api/Base';
import type { Untyped, Group } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { GroupsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryGroupHostAdd from './InventoryGroupHostAdd';
import mockHost from '../shared/data.host.json';

vi.mock('../../../api');

vi.mock('components/HostForm', () => ({
  default: ({ handleSubmit, handleCancel, submitError }: Untyped) => (
    <div>
      <button
        type="button"
        aria-label="mock-submit"
        onClick={() => handleSubmit(mockHost)}
      />
      <button type="button" aria-label="mock-cancel" onClick={handleCancel} />
      {submitError ? <div data-testid="mock-submit-error" /> : null}
    </div>
  ),
}));

function renderHostAdd(history: Untyped) {
  return renderWithContexts(
    <InventoryGroupHostAdd
      inventoryGroup={{ id: 123, inventory: 3 } as unknown as Group}
    />,
    { context: { router: { history } } }
  );
}

describe('<InventoryGroupHostAdd />', () => {
  beforeEach(() => {
    vi.mocked(GroupsAPI.createHost).mockResolvedValue({
      data: {
        ...mockHost,
      },
    } as unknown as ApiResponse<Untyped>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('handleSubmit should post to api', async () => {
    const history = createMemoryHistory();
    const { user } = renderHostAdd(history);

    await user.click(screen.getByRole('button', { name: 'mock-submit' }));

    await waitFor(() =>
      expect(GroupsAPI.createHost).toHaveBeenCalledWith(123, mockHost)
    );
  });

  test('should navigate to inventory group host list when cancel is clicked', async () => {
    const history = createMemoryHistory();
    const { user } = renderHostAdd(history);

    await user.click(screen.getByRole('button', { name: 'mock-cancel' }));

    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/inventories/inventory/3/groups/123/nested_hosts'
      )
    );
  });

  test('successful form submission should trigger redirect', async () => {
    const history = createMemoryHistory();
    const { user } = renderHostAdd(history);

    await user.click(screen.getByRole('button', { name: 'mock-submit' }));

    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/inventories/inventory/3/hosts/2/details'
      )
    );
    expect(screen.queryByTestId('mock-submit-error')).not.toBeInTheDocument();
  });

  test('failed form submission should show an error message', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    vi.mocked(GroupsAPI.createHost).mockImplementationOnce(() =>
      Promise.reject(error)
    );
    const history = createMemoryHistory();
    const { user } = renderHostAdd(history);

    await user.click(screen.getByRole('button', { name: 'mock-submit' }));

    expect(await screen.findByTestId('mock-submit-error')).toBeInTheDocument();
  });
});
