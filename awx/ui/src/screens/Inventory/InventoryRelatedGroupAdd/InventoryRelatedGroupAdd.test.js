import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { GroupsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryRelatedGroupAdd from './InventoryRelatedGroupAdd';

jest.mock('../../../api');

jest.mock('../shared/InventoryGroupForm', () => ({
  handleSubmit,
  handleCancel,
  error,
}) => (
  <div>
    <button
      type="button"
      aria-label="mock-submit"
      onClick={() => handleSubmit({ name: 'foo', description: 'bar' })}
    />
    <button type="button" aria-label="mock-cancel" onClick={handleCancel} />
    {error ? <div data-testid="mock-submit-error" /> : null}
  </div>
));

function renderRelatedAdd(history) {
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
    jest.clearAllMocks();
  });

  test('should render properly', () => {
    const history = createMemoryHistory({ initialEntries: [url] });
    renderRelatedAdd(history);
    expect(
      screen.getByRole('button', { name: 'mock-submit' })
    ).toBeInTheDocument();
  });

  test('should call api with proper data', async () => {
    GroupsAPI.create.mockResolvedValue({ data: { id: 3 } });
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
    GroupsAPI.create.mockRejectedValue({
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

    expect(
      await screen.findByTestId('mock-submit-error')
    ).toBeInTheDocument();
  });

  test('should throw error on association of group', async () => {
    GroupsAPI.create.mockResolvedValue({ data: { id: 3 } });
    GroupsAPI.associateChildGroup.mockRejectedValue({
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
    expect(
      await screen.findByTestId('mock-submit-error')
    ).toBeInTheDocument();
  });
});
