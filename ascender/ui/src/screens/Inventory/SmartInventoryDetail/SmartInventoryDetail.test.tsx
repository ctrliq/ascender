import type { Inventory } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import {
  InventoriesAPI,
  JobTemplatesAPI,
  UnifiedJobsAPI,
  WorkflowJobTemplatesAPI,
} from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import SmartInventoryDetail from './SmartInventoryDetail';
import mockSmartInventory from '../shared/data.smart_inventory.json';

vi.mock('../../../api');

describe('<SmartInventoryDetail />', () => {
  describe('User has edit permissions', () => {
    beforeEach(() => {
      vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
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
      } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
      vi.mocked(InventoriesAPI.readInstanceGroups).mockResolvedValue({
        data: {
          results: [{ id: 1, name: 'mock instance group' }],
        },
      } as unknown as ResponseOf<typeof InventoriesAPI.readInstanceGroups>);
      // What the delete dialog counts as relying on the inventory.
      vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
        data: { count: 0 },
      } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
      vi.mocked(WorkflowJobTemplatesAPI.read).mockResolvedValue({
        data: { count: 0 },
      } as unknown as ResponseOf<typeof WorkflowJobTemplatesAPI.read>);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    test('should render Details', async () => {
      renderWithContexts(
        <SmartInventoryDetail
          inventory={mockSmartInventory as unknown as Inventory}
        />
      );

      await screen.findByText('Smart Inv');
      assertDetail('Name', 'Smart Inv');
      assertDetail('Description', 'smart inv description');
      assertDetail('Type', 'Smart inventory');
      assertDetail('Organization', 'Default');
      assertDetail('Smart Host Filter', 'name__icontains=local');
      assertDetail('Instance Groups', 'mock instance group');
      assertDetail('Total Hosts', '2');

      expect(screen.getByText('Activity')).toBeInTheDocument();
      expect(screen.getByText('Variables')).toBeInTheDocument();
      expect(screen.getByText('Created')).toBeInTheDocument();
      expect(screen.getByText('Last Modified')).toBeInTheDocument();
    });

    test('should show edit button for users with edit permission', async () => {
      renderWithContexts(
        <SmartInventoryDetail
          inventory={mockSmartInventory as unknown as Inventory}
        />
      );

      const editLink = await screen.findByRole('link', { name: 'Edit' });
      expect(editLink).toHaveAttribute(
        'href',
        `/inventories/smart_inventory/${mockSmartInventory.id}/edit`
      );
    });

    test('expected api calls are made on initial render', async () => {
      renderWithContexts(
        <SmartInventoryDetail
          inventory={mockSmartInventory as unknown as Inventory}
        />
      );

      await screen.findByText('Smart Inv');
      expect(InventoriesAPI.readInstanceGroups).toHaveBeenCalledTimes(1);
      expect(UnifiedJobsAPI.read).toHaveBeenCalledTimes(1);
    });

    test('expected api call is made for delete', async () => {
      vi.mocked(InventoriesAPI.destroy).mockResolvedValueOnce(
        {} as unknown as ResponseOf<typeof InventoriesAPI.destroy>
      );
      const { user } = renderWithContexts(
        <SmartInventoryDetail
          inventory={mockSmartInventory as unknown as Inventory}
        />
      );

      await user.click(await screen.findByRole('button', { name: 'Delete' }));
      await user.click(
        await screen.findByRole('button', { name: 'Confirm Delete' })
      );

      await waitFor(() =>
        expect(InventoriesAPI.destroy).toHaveBeenCalledTimes(1)
      );
    });

    test('delete dialog names the templates that rely on the inventory', async () => {
      vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
        data: { count: 2 },
      } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
      const { user } = renderWithContexts(
        <SmartInventoryDetail
          inventory={mockSmartInventory as unknown as Inventory}
        />
      );

      await user.click(await screen.findByRole('button', { name: 'Delete' }));

      expect(
        await screen.findByText(
          'This inventory is currently being used by other resources. Are you sure you want to delete it?'
        )
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Job Templates: 2')).toBeInTheDocument();
      expect(JobTemplatesAPI.read).toHaveBeenCalledWith({
        inventory: mockSmartInventory.id,
      });
    });

    test('Error dialog shown for failed deletion', async () => {
      vi.mocked(InventoriesAPI.destroy).mockRejectedValueOnce(new Error());
      const { user } = renderWithContexts(
        <SmartInventoryDetail
          inventory={mockSmartInventory as unknown as Inventory}
        />
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
      vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
        data: { results: [] },
      } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);

      renderWithContexts(
        <SmartInventoryDetail
          inventory={mockSmartInventory as unknown as Inventory}
        />
      );

      await screen.findByText('Smart Inv');
      expect(screen.queryByText('Activity')).not.toBeInTheDocument();
    });

    test('should not load Instance Groups', async () => {
      vi.mocked(InventoriesAPI.readInstanceGroups).mockResolvedValue({
        data: {
          results: [],
        },
      } as unknown as ResponseOf<typeof InventoriesAPI.readInstanceGroups>);

      renderWithContexts(
        <SmartInventoryDetail
          inventory={mockSmartInventory as unknown as Inventory}
        />
      );

      await screen.findByText('Smart Inv');
      expect(screen.queryByText('Instance Groups')).not.toBeInTheDocument();
    });
  });

  describe('User has read-only permissions', () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    test('should hide edit button for users without edit permission', async () => {
      vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
        data: { results: [] },
      } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
      vi.mocked(InventoriesAPI.readInstanceGroups).mockResolvedValue({
        data: { results: [] },
      } as unknown as ResponseOf<typeof InventoriesAPI.readInstanceGroups>);
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
        <SmartInventoryDetail
          inventory={readOnlySmartInv as unknown as Inventory}
        />
      );

      await screen.findByText('Smart Inv');
      expect(
        screen.queryByRole('link', { name: 'Edit' })
      ).not.toBeInTheDocument();
    });

    test('should show content error when jobs request fails', async () => {
      vi.mocked(UnifiedJobsAPI.read).mockImplementationOnce(() =>
        Promise.reject(new Error())
      );
      vi.mocked(InventoriesAPI.readInstanceGroups).mockResolvedValue({
        data: { results: [] },
      } as unknown as ResponseOf<typeof InventoriesAPI.readInstanceGroups>);

      renderWithContexts(
        <SmartInventoryDetail
          inventory={mockSmartInventory as unknown as Inventory}
        />
      );

      expect(
        await screen.findByText('Something went wrong...')
      ).toBeInTheDocument();
      expect(UnifiedJobsAPI.read).toHaveBeenCalledTimes(1);
    });
  });
});
