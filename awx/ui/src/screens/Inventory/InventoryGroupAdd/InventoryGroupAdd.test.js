import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { GroupsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryGroupAdd from './InventoryGroupAdd';

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
      onClick={() =>
        handleSubmit({
          name: 'Bar',
          description: 'Ansible',
          variables: 'ying: yang',
        })
      }
    />
    <button type="button" aria-label="mock-cancel" onClick={handleCancel} />
    {error ? <div data-testid="mock-submit-error" /> : null}
  </div>
));

function renderAdd(history) {
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/inventory/:id/groups/add/*"
        element={<InventoryGroupAdd />}
      />
      <Route path="*" element={null} />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<InventoryGroupAdd />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('InventoryGroupAdd renders successfully', () => {
    const history = createMemoryHistory({
      initialEntries: ['/inventories/inventory/1/groups/add'],
    });
    renderAdd(history);
    expect(
      screen.getByRole('button', { name: 'mock-submit' })
    ).toBeInTheDocument();
  });

  test('cancel should navigate user to Inventory Groups List', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/inventories/inventory/1/groups/add'],
    });
    const { user } = renderAdd(history);

    await user.click(screen.getByRole('button', { name: 'mock-cancel' }));

    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/inventories/inventory/1/groups'
      )
    );
  });

  test('handleSubmit should call api', async () => {
    GroupsAPI.create.mockResolvedValue({ data: { id: 5 } });
    const history = createMemoryHistory({
      initialEntries: ['/inventories/inventory/1/groups/add'],
    });
    const { user } = renderAdd(history);

    await user.click(screen.getByRole('button', { name: 'mock-submit' }));

    await waitFor(() =>
      expect(GroupsAPI.create).toHaveBeenCalledWith({
        inventory: '1',
        name: 'Bar',
        description: 'Ansible',
        variables: 'ying: yang',
      })
    );
    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/inventories/inventory/1/groups/5'
      )
    );
  });
});
