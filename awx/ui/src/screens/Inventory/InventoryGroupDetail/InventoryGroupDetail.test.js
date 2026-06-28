import React from 'react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';
import { GroupsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import InventoryGroupDetail from './InventoryGroupDetail';

jest.mock('../../../api');

const inventoryGroup = {
  name: 'Foo',
  description: 'Bar',
  variables: 'bizz: buzz',
  id: 1,
  created: '2019-12-02T15:58:16.276813Z',
  modified: '2019-12-03T20:33:46.207654Z',
  summary_fields: {
    created_by: {
      username: 'James',
      id: 13,
    },
    modified_by: {
      username: 'Bond',
      id: 14,
    },
    user_capabilities: {
      delete: true,
      edit: true,
    },
  },
};

function renderAt(initialEntry, group = inventoryGroup) {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const utils = renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/groups/:groupId/details"
        element={<InventoryGroupDetail inventoryGroup={group} />}
      />
      <Route path="*" element={null} />
    </Routes>,
    {
      context: { router: { history } },
    }
  );
  return { history, ...utils };
}

describe('<InventoryGroupDetail />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('User has full permissions', () => {
    test('details should render with the proper values and action buttons shown', async () => {
      renderAt('/inventories/inventory/1/groups/1/details');

      await screen.findByText('Foo');
      assertDetail('Name', 'Foo');
      assertDetail('Description', 'Bar');
      expect(screen.getByText('Created')).toBeInTheDocument();
      expect(screen.getByText('Last Modified')).toBeInTheDocument();
      expect(screen.getByText('Variables')).toBeInTheDocument();

      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Delete' })
      ).toBeInTheDocument();
    });

    test('should navigate user to edit form on edit button click', async () => {
      const { history, user } = renderAt(
        '/inventories/inventory/1/groups/1/details'
      );

      await user.click(await screen.findByRole('button', { name: 'Edit' }));
      expect(history.location.pathname).toEqual(
        '/inventories/inventory/1/groups/1/edit'
      );
    });

    test('should open delete modal and then call api to delete the group', async () => {
      GroupsAPI.destroy.mockResolvedValueOnce({});
      const { user } = renderAt('/inventories/inventory/1/groups/1/details');

      await user.click(await screen.findByRole('button', { name: 'Delete' }));
      await user.click(
        await screen.findByRole('radio', {
          name: 'Delete All Groups and Hosts',
        })
      );
      await user.click(
        screen.getByRole('button', { name: 'Confirm Delete' })
      );

      await waitFor(() =>
        expect(GroupsAPI.destroy).toHaveBeenCalledWith(1)
      );
    });
  });

  describe('User has read-only permissions', () => {
    test('should hide edit/delete buttons', async () => {
      const readOnlyGroup = {
        ...inventoryGroup,
        summary_fields: {
          ...inventoryGroup.summary_fields,
          user_capabilities: {
            delete: false,
            edit: false,
          },
        },
      };

      renderAt('/inventories/inventory/1/groups/1/details', readOnlyGroup);

      await screen.findByText('Foo');
      expect(
        screen.queryByRole('button', { name: 'Edit' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Delete' })
      ).not.toBeInTheDocument();
    });
  });

  describe('Cannot edit or delete constructed inventory group', () => {
    test('should not show edit or delete buttons', async () => {
      renderAt('/inventories/constructed_inventory/1/groups/1/details');

      await screen.findByText('Foo');
      expect(
        screen.queryByRole('button', { name: 'Edit' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Delete' })
      ).not.toBeInTheDocument();
    });
  });
});
