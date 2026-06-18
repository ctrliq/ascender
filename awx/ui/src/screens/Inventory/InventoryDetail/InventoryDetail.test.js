import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import {
  InventoriesAPI,
  CredentialTypesAPI,
  JobTemplatesAPI,
  WorkflowJobTemplatesAPI,
} from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import InventoryDetail from './InventoryDetail';

jest.mock('../../../api');

const mockInventory = {
  id: 1,
  type: 'inventory',
  url: '/api/v2/inventories/1/',
  summary_fields: {
    organization: {
      id: 1,
      name: 'The Organization',
      description: '',
    },
    user_capabilities: {
      edit: true,
      delete: true,
      copy: true,
      adhoc: true,
    },
  },
  created: '2019-10-04T16:56:48.025455Z',
  modified: '2019-10-04T16:56:48.025468Z',
  name: 'Inv no hosts',
  description: '',
  organization: 1,
  kind: '',
  host_filter: null,
  variables: '---\nfoo: bar',
  has_active_failures: false,
  total_hosts: 0,
  hosts_with_active_failures: 0,
  total_groups: 0,
  groups_with_active_failures: 0,
  has_inventory_sources: false,
  total_inventory_sources: 0,
  inventory_sources_with_failures: 0,
  pending_deletion: false,
};

const associatedInstanceGroups = [
  {
    id: 1,
    name: 'Foo',
  },
];

describe('<InventoryDetail />', () => {
  beforeEach(() => {
    CredentialTypesAPI.read.mockResolvedValue({
      data: {
        results: [
          {
            id: 14,
            name: 'insights',
          },
        ],
      },
    });
    JobTemplatesAPI.read.mockResolvedValue({ data: { count: 0 } });
    WorkflowJobTemplatesAPI.read.mockResolvedValue({ data: { count: 0 } });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render details', async () => {
    InventoriesAPI.readInstanceGroups.mockResolvedValue({
      data: {
        results: associatedInstanceGroups,
      },
    });

    renderWithContexts(<InventoryDetail inventory={mockInventory} />);

    await screen.findByText('Inv no hosts');
    assertDetail('Name', mockInventory.name);
    assertDetail('Type', 'Inventory');
    assertDetail('Total hosts', String(mockInventory.total_hosts));
    assertDetail('Organization', mockInventory.summary_fields.organization.name);

    const orgLink = screen.getByRole('link', { name: 'The Organization' });
    expect(orgLink).toHaveAttribute('href', '/organizations/1/details');

    expect(screen.getByText('Variables')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Last Modified')).toBeInTheDocument();
  });

  test('should load instance groups', async () => {
    InventoriesAPI.readInstanceGroups.mockResolvedValue({
      data: {
        results: associatedInstanceGroups,
      },
    });

    renderWithContexts(<InventoryDetail inventory={mockInventory} />);

    await screen.findByText('Foo');
    expect(InventoriesAPI.readInstanceGroups).toHaveBeenCalledWith(
      mockInventory.id
    );
  });

  test('should not load instance groups', async () => {
    InventoriesAPI.readInstanceGroups.mockResolvedValue({
      data: {
        results: [],
      },
    });

    renderWithContexts(<InventoryDetail inventory={mockInventory} />);

    // With no instance groups the Detail renders nothing (isEmpty), so the
    // label is absent once the component has finished loading.
    await screen.findByText('Inv no hosts');
    expect(InventoriesAPI.readInstanceGroups).toHaveBeenCalledWith(
      mockInventory.id
    );
    expect(screen.queryByText('Instance Groups')).not.toBeInTheDocument();
  });

  test('should show edit and delete buttons for users with permissions', async () => {
    InventoriesAPI.readInstanceGroups.mockResolvedValue({
      data: { results: [] },
    });

    renderWithContexts(<InventoryDetail inventory={mockInventory} />);

    const editLink = await screen.findByRole('link', { name: 'Edit' });
    expect(editLink).toHaveAttribute(
      'href',
      `/inventories/inventory/${mockInventory.id}/edit`
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  test('expected api call is made for delete', async () => {
    InventoriesAPI.readInstanceGroups.mockResolvedValue({
      data: { results: [] },
    });
    InventoriesAPI.destroy.mockResolvedValueOnce({});

    const { user } = renderWithContexts(
      <InventoryDetail inventory={mockInventory} />
    );

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );

    await waitFor(() =>
      expect(InventoriesAPI.destroy).toHaveBeenCalledWith(mockInventory.id)
    );
  });

  test('Error dialog shown for failed deletion', async () => {
    InventoriesAPI.readInstanceGroups.mockResolvedValue({
      data: { results: [] },
    });
    InventoriesAPI.destroy.mockRejectedValueOnce(new Error());

    const { user } = renderWithContexts(
      <InventoryDetail inventory={mockInventory} />
    );

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    expect(screen.getByText('Failed to delete inventory.')).toBeInTheDocument();
  });
});
