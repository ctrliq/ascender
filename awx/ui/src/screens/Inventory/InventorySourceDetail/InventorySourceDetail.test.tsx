import type { InventorySource } from 'types/api';
import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';
import {
  InventorySourcesAPI,
  InventoriesAPI,
  WorkflowJobTemplateNodesAPI,
} from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import InventorySourceDetail from './InventorySourceDetail';
import mockInvSourceJson from '../shared/data.inventory_source.json';

/** The fixture as the detail takes it, which is what the api sends. */
const mockInvSource = mockInvSourceJson as unknown as InventorySource;

vi.mock('../../../api');

describe('InventorySourceDetail', () => {
  beforeEach(() => {
    vi.mocked(InventoriesAPI.updateSources).mockResolvedValue({
      data: [{ inventory_source: 1 }],
    } as unknown as ResponseOf<typeof InventoriesAPI.updateSources>);
    vi.mocked(WorkflowJobTemplateNodesAPI.read).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof WorkflowJobTemplateNodesAPI.read>);
    vi.mocked(InventorySourcesAPI.readGroups).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.readGroups>);
    vi.mocked(InventorySourcesAPI.readHosts).mockResolvedValue({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.readHosts>);
    vi.mocked(InventorySourcesAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {
            source: {
              choices: [
                ['file', 'File, Directory or Script'],
                ['scm', 'Sourced from a Project'],
                ['ec2', 'Amazon EC2'],
                ['gce', 'Google Compute Engine'],
                ['azure_rm', 'Microsoft Azure Resource Manager'],
                ['vmware', 'VMware vCenter'],
                ['satellite6', 'Red Hat Satellite 6'],
                ['openstack', 'OpenStack'],
                ['rhv', 'Red Hat Virtualization'],
                ['ascender', 'CIQ Ascender Automation Platform'],
              ],
            },
          },
        },
      },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.readOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render cancel button while job is running', async () => {
    renderWithContexts(
      <InventorySourceDetail
        inventorySource={
          {
            ...mockInvSource,
            summary_fields: {
              ...mockInvSource.summary_fields,
              current_job: {
                id: 42,
                status: 'running',
              },
            },
          } as unknown as InventorySource
        }
      />
    );

    expect(
      await screen.findByRole('button', {
        name: 'Cancel Inventory Source Sync',
      })
    ).toBeInTheDocument();
  });

  test('should render expected details', async () => {
    renderWithContexts(
      <InventorySourceDetail inventorySource={mockInvSource} />
    );

    await screen.findByText('mock inv source');
    assertDetail('Name', 'mock inv source');
    assertDetail('Description', 'mock description');
    assertDetail('Source', 'Sourced from a Project');
    assertDetail('Organization', 'Mock Org');
    assertDetail('Project', 'Mock Project');
    assertDetail('Inventory file', 'foo');
    assertDetail('Cache timeout', '2 seconds');
    assertDetail('Verbosity', '2 (More Verbose)');

    assertDetail(
      'Execution Environment',
      mockInvSource.summary_fields.execution_environment?.name
    );

    // CredentialChip splits "Cloud:" and the name across nodes; assert on the
    // Credential detail's combined text content instead.
    assertDetail('Credential', 'Cloud: mock cred');
    expect(screen.getByText('Source variables')).toBeInTheDocument();

    const options = screen.getByText('Enabled Options').nextElementSibling;
    expect(options).toHaveTextContent(
      'Overwrite local groups and hosts from remote inventory source'
    );
    expect(options).toHaveTextContent(
      'Overwrite local variables from remote inventory source'
    );
    expect(options).toHaveTextContent('Update on launch');
  });

  test('should display expected action buttons for users with permissions', async () => {
    renderWithContexts(
      <InventorySourceDetail inventorySource={mockInvSource} />
    );

    const editLink = await screen.findByRole('link', { name: 'edit' });
    expect(editLink).toHaveAttribute(
      'href',
      '/inventories/inventory/2/sources/123/edit'
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Start sync source' })
    ).toBeInTheDocument();
  });

  test('should hide expected action buttons for users without permissions', async () => {
    const userCapabilities = {
      edit: false,
      delete: false,
      start: false,
    };
    const invSource = {
      ...mockInvSource,
      summary_fields: { ...userCapabilities },
    };

    renderWithContexts(<InventorySourceDetail inventorySource={invSource} />);

    await screen.findByText('mock inv source');
    expect(
      screen.queryByRole('link', { name: 'edit' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Start sync source' })
    ).not.toBeInTheDocument();
  });

  test('expected api call is made for delete', async () => {
    vi.mocked(InventorySourcesAPI.destroy).mockResolvedValueOnce(
      {} as unknown as ResponseOf<typeof InventorySourcesAPI.destroy>
    );
    vi.mocked(InventorySourcesAPI.destroyHosts).mockResolvedValueOnce(
      {} as unknown as ResponseOf<typeof InventorySourcesAPI.destroyHosts>
    );
    vi.mocked(InventorySourcesAPI.destroyGroups).mockResolvedValueOnce(
      {} as unknown as ResponseOf<typeof InventorySourcesAPI.destroyGroups>
    );
    const history = createMemoryHistory({
      initialEntries: ['/inventories/inventory/2/sources/123/details'],
    });

    const { user } = renderWithContexts(
      <InventorySourceDetail inventorySource={mockInvSource} />,
      { context: { router: { history } } }
    );

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );

    await waitFor(() =>
      expect(InventorySourcesAPI.destroy).toHaveBeenCalledTimes(1)
    );
    expect(InventorySourcesAPI.destroyHosts).toHaveBeenCalledTimes(1);
    expect(InventorySourcesAPI.destroyGroups).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/inventories/inventory/2/sources'
      )
    );
  });

  test('Content error shown for failed options request', async () => {
    vi.mocked(InventorySourcesAPI.readOptions).mockImplementationOnce(() =>
      Promise.reject(new Error())
    );

    renderWithContexts(
      <InventorySourceDetail inventorySource={mockInvSource} />
    );

    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
    expect(InventorySourcesAPI.readOptions).toHaveBeenCalledTimes(1);
  });

  test('Error dialog shown for failed deletion', async () => {
    vi.mocked(InventorySourcesAPI.destroy).mockImplementationOnce(() =>
      Promise.reject(new Error())
    );

    const { user } = renderWithContexts(
      <InventorySourceDetail inventorySource={mockInvSource} />
    );

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
  });

  test('should not load Credentials', async () => {
    renderWithContexts(
      <InventorySourceDetail
        inventorySource={
          {
            ...mockInvSource,
            summary_fields: {
              credentials: [],
            },
          } as unknown as InventorySource
        }
      />
    );

    // With no credentials the Detail renders nothing (isEmpty), so the
    // label is absent once the component has loaded.
    await screen.findByText('mock inv source');
    expect(screen.queryByText('Credential')).not.toBeInTheDocument();
  });
});
