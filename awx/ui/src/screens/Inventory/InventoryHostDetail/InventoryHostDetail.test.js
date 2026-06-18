import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { HostsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';
import InventoryHostDetail from './InventoryHostDetail';
import mockHost from '../shared/data.host.json';

jest.mock('../../../api');

describe('<InventoryHostDetail />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('User has edit permissions', () => {
    test('should render Details', () => {
      renderWithContexts(<InventoryHostDetail host={mockHost} />);
      assertDetail('Name', 'localhost');
      assertDetail('Description', 'localhost description');
      assertDetail('Created', '10/28/2019, 9:26:54 PM');
      assertDetail('Last Modified', '10/29/2019, 8:18:41 PM');
    });

    test('should show edit button for users with edit permission', () => {
      renderWithContexts(<InventoryHostDetail host={mockHost} />);
      const editButton = screen.getByRole('link', { name: 'edit' });
      expect(editButton).toHaveTextContent('Edit');
      expect(editButton).toHaveAttribute(
        'href',
        '/inventories/inventory/3/hosts/2/edit'
      );
    });

    test('expected api call is made for delete', async () => {
      const { user } = renderWithContexts(
        <InventoryHostDetail host={mockHost} />
      );
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await user.click(
        await screen.findByRole('button', { name: 'Confirm Delete' })
      );
      await waitFor(() => expect(HostsAPI.destroy).toHaveBeenCalledTimes(1));
    });

    test('Error dialog shown for failed deletion', async () => {
      HostsAPI.destroy.mockImplementationOnce(() =>
        Promise.reject(new Error())
      );
      const { user } = renderWithContexts(
        <InventoryHostDetail host={mockHost} />
      );
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await user.click(
        await screen.findByRole('button', { name: 'Confirm Delete' })
      );
      expect(await screen.findByText('Error!')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() =>
        expect(screen.queryByText('Error!')).not.toBeInTheDocument()
      );
      await settleTooltips();
    });
  });

  describe('User has read-only permissions', () => {
    const readOnlyHost = {
      ...mockHost,
      summary_fields: {
        ...mockHost.summary_fields,
        user_capabilities: {
          ...mockHost.summary_fields.user_capabilities,
          edit: false,
        },
        recent_jobs: [],
      },
    };

    test('should hide activity stream when there are no recent jobs', () => {
      renderWithContexts(<InventoryHostDetail host={readOnlyHost} />);
      // with no recent jobs the Activity Detail is empty and renders nothing
      expect(screen.queryByText('Activity')).not.toBeInTheDocument();
    });

    test('should hide edit button for users without edit permission', () => {
      renderWithContexts(<InventoryHostDetail host={readOnlyHost} />);
      expect(
        screen.queryByRole('link', { name: 'edit' })
      ).not.toBeInTheDocument();
    });
  });
});
