import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { GroupsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryGroupEdit from './InventoryGroupEdit';

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

function renderEdit(history) {
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/inventory/:id/groups/:groupId/edit/*"
        element={<InventoryGroupEdit inventoryGroup={{ id: 2 }} />}
      />
      <Route path="*" element={null} />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<InventoryGroupEdit />', () => {
  beforeEach(() => {
    GroupsAPI.readDetail.mockResolvedValue({
      data: {
        name: 'Foo',
        description: 'Bar',
        variables: 'bizz: buzz',
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('InventoryGroupEdit renders successfully', () => {
    const history = createMemoryHistory({
      initialEntries: ['/inventories/inventory/1/groups/2/edit'],
    });
    renderEdit(history);
    expect(
      screen.getByRole('button', { name: 'mock-submit' })
    ).toBeInTheDocument();
  });

  test('cancel should navigate user to Inventory Groups List', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/inventories/inventory/1/groups/2/edit'],
    });
    const { user } = renderEdit(history);

    await user.click(screen.getByRole('button', { name: 'mock-cancel' }));

    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/inventories/inventory/1/groups/2'
      )
    );
  });

  test('handleSubmit should call api', async () => {
    GroupsAPI.update.mockResolvedValue({ data: {} });
    const history = createMemoryHistory({
      initialEntries: ['/inventories/inventory/1/groups/2/edit'],
    });
    const { user } = renderEdit(history);

    await user.click(screen.getByRole('button', { name: 'mock-submit' }));

    await waitFor(() =>
      expect(GroupsAPI.update).toHaveBeenCalledWith('2', {
        name: 'Bar',
        description: 'Ansible',
        variables: 'ying: yang',
      })
    );
    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/inventories/inventory/1/groups/2/details'
      )
    );
  });
});
