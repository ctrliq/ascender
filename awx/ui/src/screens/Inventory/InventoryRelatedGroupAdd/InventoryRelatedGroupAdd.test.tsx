import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { GroupsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import type { MockHandlerFormProps } from '../../../../testUtils/rtlContexts';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryRelatedGroupAdd from './InventoryRelatedGroupAdd';

vi.mock('../../../api');

vi.mock('../shared/InventoryGroupForm', () => ({
  default: ({
    handleSubmit,
    handleCancel,
    error,
  }: MockHandlerFormProps & { error?: unknown }) => (
    <div>
      <button
        type="button"
        aria-label="mock-submit"
        onClick={() => handleSubmit({ name: 'foo', description: 'bar' })}
      />
      <button type="button" aria-label="mock-cancel" onClick={handleCancel} />
      {error ? <div data-testid="mock-submit-error" /> : null}
    </div>
  ),
}));

function renderRelatedAdd(history: TestHistory) {
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/inventory/:id/groups/:groupId/nested_groups/add/*"
        element={<InventoryRelatedGroupAdd />}
      />
      <Route path="*" element={null} />
    </Routes>,
    { context: { router: { history } } }
  );
}

const url = '/inventories/inventory/1/groups/2/nested_groups/add';

describe('<InventoryRelatedGroupAdd/>', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render properly', () => {
    const history = createMemoryHistory({ initialEntries: [url] });
    renderRelatedAdd(history);
    expect(
      screen.getByRole('button', { name: 'mock-submit' })
    ).toBeInTheDocument();
  });

  test('should call api with proper data', async () => {
    vi.mocked(GroupsAPI.create).mockResolvedValue({
      data: { id: 3 },
    } as unknown as ResponseOf<typeof GroupsAPI.create>);
    const history = createMemoryHistory({ initialEntries: [url] });
    const { user } = renderRelatedAdd(history);

    await user.click(screen.getByRole('button', { name: 'mock-submit' }));

    await waitFor(() =>
      expect(GroupsAPI.create).toHaveBeenCalledWith({
        inventory: '1',
        name: 'foo',
        description: 'bar',
      })
    );
    await waitFor(() =>
      expect(GroupsAPI.associateChildGroup).toHaveBeenCalledWith('2', 3)
    );
  });

  test('cancel should navigate user to Inventory Groups List', async () => {
    const history = createMemoryHistory({ initialEntries: [url] });
    const { user } = renderRelatedAdd(history);

    await user.click(screen.getByRole('button', { name: 'mock-cancel' }));

    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/inventories/inventory/1/groups/2/nested_groups'
      )
    );
  });

  test('should throw error on creation of group', async () => {
    vi.mocked(GroupsAPI.create).mockRejectedValue({
      response: {
        config: {
          method: 'post',
          url: '/api/v2/groups/',
        },
        data: { detail: 'An error occurred' },
      },
    });
    const history = createMemoryHistory({ initialEntries: [url] });
    const { user } = renderRelatedAdd(history);

    await user.click(screen.getByRole('button', { name: 'mock-submit' }));

    expect(await screen.findByTestId('mock-submit-error')).toBeInTheDocument();
  });

  test('should throw error on association of group', async () => {
    vi.mocked(GroupsAPI.create).mockResolvedValue({
      data: { id: 3 },
    } as unknown as ResponseOf<typeof GroupsAPI.create>);
    vi.mocked(GroupsAPI.associateChildGroup).mockRejectedValue({
      response: {
        config: {
          method: 'post',
          url: '/api/v2/groups/',
        },
        data: { detail: 'An error occurred' },
      },
    });
    const history = createMemoryHistory({ initialEntries: [url] });
    const { user } = renderRelatedAdd(history);

    await user.click(screen.getByRole('button', { name: 'mock-submit' }));

    await waitFor(() =>
      expect(GroupsAPI.create).toHaveBeenCalledWith({
        inventory: '1',
        name: 'foo',
        description: 'bar',
      })
    );
    expect(await screen.findByTestId('mock-submit-error')).toBeInTheDocument();
  });
});
