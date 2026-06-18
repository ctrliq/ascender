import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { InventoriesAPI, UnifiedJobsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import SmartInventoryDetail from './SmartInventoryDetail';
import mockSmartInventory from '../shared/data.smart_inventory.json';

jest.mock('../../../api');

describe('<SmartInventoryDetail />', () => {
  describe('User has edit permissions', () => {
    beforeEach(() => {
      UnifiedJobsAPI.read.mockResolvedValue({
        data: {
          results: [
            {
              id: 1,
              name: 'job 1',
              type: 'job',
              status: 'successful',
            },
          ],
        },
      });
      InventoriesAPI.readInstanceGroups.mockResolvedValue({
        data: {
          results: [{ id: 1, name: 'mock instance group' }],
        },
      });
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    test('should render Details', async () => {
      renderWithContexts(
        <SmartInventoryDetail inventory={mockSmartInventory} />
      );

      await screen.findByText('Smart Inv');
      assertDetail('Name', 'Smart Inv');
      assertDetail('Description', 'smart inv description');
      assertDetail('Type', 'Smart inventory');
      assertDetail('Organization', 'Default');
      assertDetail('Smart host filter', 'name__icontains=local');
      assertDetail('Instance groups', 'mock instance group');
      assertDetail('Total hosts', '2');

      expect(screen.getByText('Activity')).toBeInTheDocument();
      expect(screen.getByText('Variables')).toBeInTheDocument();
      expect(screen.getByText('Created')).toBeInTheDocument();
      expect(screen.getByText('Last modified')).toBeInTheDocument();
    });

    test('should show edit button for users with edit permission', async () => {
      renderWithContexts(
        <SmartInventoryDetail inventory={mockSmartInventory} />
      );

      const editLink = await screen.findByRole('link', { name: 'edit' });
      expect(editLink).toHaveAttribute(
        'href',
        `/inventories/smart_inventory/${mockSmartInventory.id}/edit`
      );
    });

    test('expected api calls are made on initial render', async () => {
      renderWithContexts(
        <SmartInventoryDetail inventory={mockSmartInventory} />
      );

      await screen.findByText('Smart Inv');
      expect(InventoriesAPI.readInstanceGroups).toHaveBeenCalledTimes(1);
      expect(UnifiedJobsAPI.read).toHaveBeenCalledTimes(1);
    });

    test('expected api call is made for delete', async () => {
      InventoriesAPI.destroy.mockResolvedValueOnce({});
      const { user } = renderWithContexts(
        <SmartInventoryDetail inventory={mockSmartInventory} />
      );

      await user.click(await screen.findByRole('button', { name: 'Delete' }));
      await user.click(
        await screen.findByRole('button', { name: 'Confirm Delete' })
      );

      await waitFor(() =>
        expect(InventoriesAPI.destroy).toHaveBeenCalledTimes(1)
      );
    });

    test('Error dialog shown for failed deletion', async () => {
      InventoriesAPI.destroy.mockRejectedValueOnce(new Error());
      const { user } = renderWithContexts(
        <SmartInventoryDetail inventory={mockSmartInventory} />
      );

      await user.click(await screen.findByRole('button', { name: 'Delete' }));
      await user.click(
        await screen.findByRole('button', { name: 'Confirm Delete' })
      );

      expect(await screen.findByText('Error!')).toBeInTheDocument();
      expect(
        screen.getByText('Failed to delete smart inventory.')
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() =>
        expect(screen.queryByText('Error!')).not.toBeInTheDocument()
      );
    });

    test('should not load Activity', async () => {
      // Activity is sourced from UnifiedJobsAPI.read; with no recent jobs the
      // Detail renders nothing (isEmpty), so the label is absent.
      UnifiedJobsAPI.read.mockResolvedValue({ data: { results: [] } });

      renderWithContexts(
        <SmartInventoryDetail inventory={mockSmartInventory} />
      );

      await screen.findByText('Smart Inv');
      expect(screen.queryByText('Activity')).not.toBeInTheDocument();
    });

    test('should not load Instance Groups', async () => {
      InventoriesAPI.readInstanceGroups.mockResolvedValue({
        data: {
          results: [],
        },
      });

      renderWithContexts(
        <SmartInventoryDetail inventory={mockSmartInventory} />
      );

      await screen.findByText('Smart Inv');
      expect(screen.queryByText('Instance groups')).not.toBeInTheDocument();
    });
  });

  describe('User has read-only permissions', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    test('should hide edit button for users without edit permission', async () => {
      UnifiedJobsAPI.read.mockResolvedValue({ data: { results: [] } });
      InventoriesAPI.readInstanceGroups.mockResolvedValue({
        data: { results: [] },
      });
      const readOnlySmartInv = {
        ...mockSmartInventory,
        summary_fields: {
          ...mockSmartInventory.summary_fields,
          user_capabilities: {
            ...mockSmartInventory.summary_fields.user_capabilities,
            edit: false,
          },
        },
      };

      renderWithContexts(
        <SmartInventoryDetail inventory={readOnlySmartInv} />
      );

      await screen.findByText('Smart Inv');
      expect(
        screen.queryByRole('link', { name: 'edit' })
      ).not.toBeInTheDocument();
    });

    test('should show content error when jobs request fails', async () => {
      UnifiedJobsAPI.read.mockImplementationOnce(() =>
        Promise.reject(new Error())
      );
      InventoriesAPI.readInstanceGroups.mockResolvedValue({
        data: { results: [] },
      });

      renderWithContexts(
        <SmartInventoryDetail inventory={mockSmartInventory} />
      );

      expect(
        await screen.findByText('Something went wrong...')
      ).toBeInTheDocument();
      expect(UnifiedJobsAPI.read).toHaveBeenCalledTimes(1);
    });
  });
});
