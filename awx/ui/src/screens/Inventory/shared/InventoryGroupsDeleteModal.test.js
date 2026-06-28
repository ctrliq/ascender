import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { InventoriesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import InventoryGroupsDeleteModal from './InventoryGroupsDeleteModal';

jest.mock('../../../api');

function renderModal() {
  const history = createMemoryHistory({
    initialEntries: ['/inventories/inventory/1/groups'],
  });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/groups/*"
        element={
          <InventoryGroupsDeleteModal
            onAfterDelete={() => {}}
            isDisabled={false}
            groups={[
              { id: 1, name: 'Foo' },
              { id: 2, name: 'Bar' },
            ]}
          />
        }
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<InventoryGroupsDeleteModal />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should open the confirmation modal', async () => {
    const { user } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(
      await screen.findByRole('dialog', { name: /Delete Groups\?/ })
    ).toBeInTheDocument();
  });

  test('should close modal', async () => {
    const { user } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await screen.findByRole('dialog');

    // close via the user-visible Cancel button (its aria-label is "Close",
    // shared with the ModalBox X, so target it by its visible text instead)
    await user.click(screen.getByText('Cancel'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });

  test('should delete properly', async () => {
    InventoriesAPI.promoteGroup.mockResolvedValue({});
    const { user } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await screen.findByRole('dialog');

    await user.click(
      screen.getByRole('radio', { name: 'Promote Child Groups and Hosts' })
    );

    const confirm = screen.getByRole('button', { name: 'Confirm Delete' });
    expect(confirm).not.toBeDisabled();
    await user.click(confirm);

    await waitFor(() =>
      expect(InventoriesAPI.promoteGroup).toHaveBeenCalledWith('1', 1)
    );
  });

  test('should throw deletion error', async () => {
    InventoriesAPI.promoteGroup.mockRejectedValue(new Error());
    const { user } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await screen.findByRole('dialog');

    await user.click(
      screen.getByRole('radio', { name: 'Promote Child Groups and Hosts' })
    );
    await user.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    await waitFor(() =>
      expect(InventoriesAPI.promoteGroup).toHaveBeenCalledWith('1', 1)
    );
    expect(await screen.findByText('Error!')).toBeInTheDocument();
  });
});
