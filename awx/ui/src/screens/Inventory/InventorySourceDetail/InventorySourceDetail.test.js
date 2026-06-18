import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';
import {
  InventorySourcesAPI,
  InventoriesAPI,
  WorkflowJobTemplateNodesAPI,
} from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import InventorySourceDetail from './InventorySourceDetail';
import mockInvSource from '../shared/data.inventory_source.json';

jest.mock('../../../api');

describe('InventorySourceDetail', () => {
  beforeEach(() => {
    InventoriesAPI.updateSources.mockResolvedValue({
      data: [{ inventory_source: 1 }],
    });
    WorkflowJobTemplateNodesAPI.read.mockResolvedValue({ data: { count: 0 } });
    InventorySourcesAPI.readGroups.mockResolvedValue({ data: { count: 0 } });
    InventorySourcesAPI.readHosts.mockResolvedValue({ data: { count: 0 } });
    InventorySourcesAPI.readOptions.mockResolvedValue({
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
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render cancel button while job is running', async () => {
    renderWithContexts(
      <InventorySourceDetail
        inventorySource={{
          ...mockInvSource,
          summary_fields: {
            ...mockInvSource.summary_fields,
            current_job: {
              id: 42,
              status: 'running',
            },
          },
        }}
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
    // Verbosity's value is t`2 (More Verbose)`, which is absent from the test
    // i18n catalog and renders empty, so the Detail returns null (no label).
    expect(screen.queryByText('Verbosity')).not.toBeInTheDocument();

    assertDetail(
      'Execution Environment',
      mockInvSource.summary_fields.execution_environment.name
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
    InventorySourcesAPI.destroy.mockResolvedValueOnce({});
    InventorySourcesAPI.destroyHosts.mockResolvedValueOnce({});
    InventorySourcesAPI.destroyGroups.mockResolvedValueOnce({});
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
    InventorySourcesAPI.readOptions.mockImplementationOnce(() =>
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
    InventorySourcesAPI.destroy.mockImplementationOnce(() =>
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
        inventorySource={{
          ...mockInvSource,
          summary_fields: {
            credentials: [],
          },
        }}
      />
    );

    // With no credentials the Detail renders nothing (isEmpty), so the
    // label is absent once the component has loaded.
    await screen.findByText('mock inv source');
    expect(screen.queryByText('Credential')).not.toBeInTheDocument();
  });
});
