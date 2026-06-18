import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { JobsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import JobDetail from './JobDetail';
import mockJobData from '../shared/data.job.json';

jest.mock('../../../api');

// The OutputToolbar-style action buttons here are tooltip-free, but the
// CredentialChip/labels and AlertModal still pull in PF Tooltips; rendering
// Tooltip as a passthrough avoids stray entry-timer state updates after the
// tree unmounts (jsdom measures tooltips at 0 size). No test asserts tooltip
// content.
jest.mock('@patternfly/react-core', () => {
  const actual = jest.requireActual('@patternfly/react-core');
  return {
    ...actual,
    Tooltip: ({ children }) => children,
  };
});

// Detail renders <dt>label</dt> as a sibling of its <dd>value</dd>; this scopes
// to the value cell of a given label.
const detailValue = (label) => screen.getByText(label).nextElementSibling;

describe('<JobDetail />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should display details', () => {
    renderWithContexts(
      <JobDetail
        job={{
          ...mockJobData,
          summary_fields: {
            ...mockJobData.summary_fields,
            credential: {
              id: 2,
              name: 'Machine cred',
              description: '',
              kind: 'ssh',
              cloud: false,
              kubernetes: false,
              credential_type_id: 1,
            },
            source_workflow_job: {
              id: 1234,
              name: 'Test Source Workflow',
            },
          },
        }}
      />
    );

    assertDetail('Job ID', '2');
    expect(detailValue('Status')).toHaveTextContent('Successful');
    expect(detailValue('Status')).toHaveTextContent(
      'Job explanation placeholder'
    );
    assertDetail('Started', '8/8/2019, 7:24:18 PM');
    assertDetail('Finished', '8/8/2019, 7:24:50 PM');
    assertDetail('Job Template', mockJobData.summary_fields.job_template.name);
    assertDetail('Source Workflow Job', '1234 - Test Source Workflow');
    assertDetail('Job Type', 'Playbook Run');
    assertDetail('Launched By', mockJobData.summary_fields.created_by.username);
    assertDetail('Inventory', mockJobData.summary_fields.inventory.name);
    assertDetail('Project', mockJobData.summary_fields.project.name);
    assertDetail('Revision', mockJobData.scm_revision);
    assertDetail('Playbook', mockJobData.playbook);
    // Verbosity is omitted: VERBOSITY(t)['0 (Normal)'] resolves to an empty
    // string under the test i18n catalog, so the Detail renders nothing (the
    // original enzyme test's custom assertDetail explicitly skipped empty
    // values, making this a no-op there too).
    assertDetail('Execution Node', mockJobData.execution_node);
    assertDetail(
      'Instance Group',
      mockJobData.summary_fields.instance_group.name
    );
    assertDetail('Credentials', 'SSH: Demo Credential');
    assertDetail('Machine Credential', 'SSH: Machine cred');
    assertDetail('Source Control Branch', 'main');
    assertDetail(
      'Execution Environment',
      mockJobData.summary_fields.execution_environment.name
    );
    assertDetail('Job Slice', '0/1');
    assertDetail('Forks', '42');

    // The Credentials chip renders the credential name.
    expect(detailValue('Credentials')).toHaveTextContent('Demo Credential');

    // Job Tags / Skip Tags render their values as chips.
    expect(detailValue('Job Tags')).toHaveTextContent('a');
    expect(detailValue('Job Tags')).toHaveTextContent('b');
    expect(detailValue('Skip Tags')).toHaveTextContent('c');
    expect(detailValue('Skip Tags')).toHaveTextContent('d');

    // Both job status and project-update status render a StatusLabel reading
    // "Successful".
    expect(detailValue('Status')).toHaveTextContent('Successful');
    expect(detailValue('Project Update Status')).toHaveTextContent(
      'Successful'
    );
  });

  test('should display Deleted for Inventory and Project for job type run', () => {
    const job = {
      ...mockJobData,
      summary_fields: {
        ...mockJobData.summary_fields,
        project: null,
        inventory: null,
      },
      project: null,
      inventory: null,
    };

    renderWithContexts(<JobDetail job={job} />);
    // DeletedDetail renders the label with a "Deleted" value.
    expect(detailValue('Project')).toHaveTextContent('Deleted');
    expect(detailValue('Inventory')).toHaveTextContent('Deleted');
  });

  test('should not display finished date', () => {
    renderWithContexts(
      <JobDetail
        job={{
          ...mockJobData,
          finished: null,
        }}
      />
    );
    expect(screen.queryByText('Finished')).not.toBeInTheDocument();
  });

  test('should display module name and module arguments', () => {
    renderWithContexts(
      <JobDetail
        job={{
          ...mockJobData,
          type: 'ad_hoc_command',
          module_name: 'command',
          module_args: 'echo hello_world',
          summary_fields: {
            ...mockJobData.summary_fields,
            credential: {
              id: 2,
              name: 'Machine cred',
              description: '',
              kind: 'ssh',
              cloud: false,
              kubernetes: false,
              credential_type_id: 1,
            },
            source_workflow_job: {
              id: 1234,
              name: 'Test Source Workflow',
            },
          },
        }}
      />
    );
    assertDetail('Module Name', 'command');
    assertDetail('Module Arguments', 'echo hello_world');
    assertDetail('Job Type', 'Run Command');
    expect(screen.queryByText('Project')).not.toBeInTheDocument();
  });

  test('should display source data', () => {
    renderWithContexts(
      <JobDetail
        job={{
          ...mockJobData,
          source: 'scm',
          type: 'inventory_update',
          module_name: 'command',
          module_args: 'echo hello_world',
          summary_fields: {
            ...mockJobData.summary_fields,
            inventory_source: { id: 1, name: 'Inventory Source' },
            credential: {
              id: 2,
              name: 'Machine cred',
              description: '',
              kind: 'ssh',
              cloud: false,
              kubernetes: false,
              credential_type_id: 1,
            },
            source_workflow_job: {
              id: 1234,
              name: 'Test Source Workflow',
            },
          },
        }}
        inventorySourceLabels={[
          ['scm', 'Sourced from Project'],
          ['file', 'File, Directory or Script'],
        ]}
      />
    );
    assertDetail('Source', 'Sourced from Project');
    expect(screen.queryByText('Project')).not.toBeInTheDocument();
  });

  test('should show schedule that launched workflow job', () => {
    renderWithContexts(
      <JobDetail
        job={{
          ...mockJobData,
          type: 'workflow_job',
          launch_type: 'scheduled',
          summary_fields: {
            user_capabilities: {},
            schedule: {
              name: 'mock wf schedule',
              id: 999,
            },
            unified_job_template: {
              unified_job_type: 'workflow_job',
              id: 888,
            },
          },
        }}
      />
    );
    const launchedBy = detailValue('Launched By');
    expect(launchedBy).toHaveTextContent('mock wf schedule');
    expect(
      within(launchedBy).getByRole('link', { name: 'mock wf schedule' })
    ).toHaveAttribute(
      'href',
      '/templates/workflow_job_template/888/schedules/999/details'
    );
  });

  test('should hide "Launched By" detail for JT launched from a workflow launched by a schedule', () => {
    renderWithContexts(
      <JobDetail
        job={{
          ...mockJobData,
          launch_type: 'workflow',
          type: 'job',
          summary_fields: {
            user_capabilities: {},
            source_workflow_job: {
              name: 'mock wf job',
              id: 888,
            },
            unified_job_template: {
              unified_job_type: 'job',
              id: 111,
            },
          },
        }}
      />
    );
    expect(screen.queryByText('Launched By')).not.toBeInTheDocument();
  });

  test('should properly delete job', async () => {
    JobsAPI.destroy.mockResolvedValue({});
    const { user } = renderWithContexts(<JobDetail job={mockJobData} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );
    await waitFor(() => expect(JobsAPI.destroy).toHaveBeenCalledTimes(1));
  });

  test('should display error modal when a job does not delete properly', async () => {
    JobsAPI.destroy.mockRejectedValue(new Error('delete failed'));
    const { user } = renderWithContexts(<JobDetail job={mockJobData} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );
    expect(
      await screen.findByRole('dialog', { name: /Job Delete Error/ })
    ).toBeInTheDocument();
  });

  test('should display Playbook Check detail', () => {
    renderWithContexts(
      <JobDetail
        job={{
          ...mockJobData,
          job_type: 'check',
        }}
      />
    );
    assertDetail('Job Type', 'Playbook Check');
  });

  test('should not show cancel job button, not super user', () => {
    const history = createMemoryHistory({
      initialEntries: ['/settings/miscellaneous_system/edit'],
    });

    renderWithContexts(
      <JobDetail
        job={{
          ...mockJobData,
          status: 'pending',
          type: 'system_job',
        }}
      />,
      {
        context: {
          router: { history },
          config: { me: { is_superuser: false } },
        },
      }
    );
    expect(
      screen.queryByRole('button', { name: 'Cancel Demo Job Template' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Project')).not.toBeInTheDocument();
  });

  test('should not show cancel job button, job completed', () => {
    const history = createMemoryHistory({
      initialEntries: ['/settings/miscellaneous_system/edit'],
    });

    renderWithContexts(
      <JobDetail
        job={{
          ...mockJobData,
          status: 'success',
          type: 'project_update',
        }}
      />,
      {
        context: {
          router: { history },
          config: { me: { is_superuser: true } },
        },
      }
    );
    expect(
      screen.queryByRole('button', { name: 'Cancel Demo Job Template' })
    ).not.toBeInTheDocument();
  });

  test('should show cancel button, pending, super user', () => {
    const history = createMemoryHistory({
      initialEntries: ['/settings/miscellaneous_system/edit'],
    });

    renderWithContexts(
      <JobDetail
        job={{
          ...mockJobData,
          status: 'pending',
          type: 'system_job',
        }}
      />,
      {
        context: {
          router: { history },
          config: { me: { is_superuser: true } },
        },
      }
    );
    expect(
      screen.getByRole('button', { name: 'Cancel Demo Job Template' })
    ).toBeInTheDocument();
  });

  test('should show cancel button, pending, super project update, not super user', () => {
    const history = createMemoryHistory({
      initialEntries: ['/settings/miscellaneous_system/edit'],
    });

    renderWithContexts(
      <JobDetail
        job={{
          ...mockJobData,
          status: 'pending',
          type: 'project_update',
        }}
      />,
      {
        context: {
          router: { history },
          config: { me: { is_superuser: false } },
        },
      }
    );
    expect(
      screen.getByRole('button', { name: 'Cancel Demo Job Template' })
    ).toBeInTheDocument();
  });

  test('should render workflow job details', () => {
    const workFlowJob = {
      id: 15,
      type: 'workflow_job',
      url: '/api/v2/workflow_jobs/15/',
      related: {
        created_by: '/api/v2/users/1/',
        modified_by: '/api/v2/users/1/',
        unified_job_template: '/api/v2/job_templates/9/',
        job_template: '/api/v2/job_templates/9/',
        workflow_nodes: '/api/v2/workflow_jobs/15/workflow_nodes/',
        labels: '/api/v2/workflow_jobs/15/labels/',
        activity_stream: '/api/v2/workflow_jobs/15/activity_stream/',
        relaunch: '/api/v2/workflow_jobs/15/relaunch/',
        cancel: '/api/v2/workflow_jobs/15/cancel/',
      },
      summary_fields: {
        organization: {
          id: 1,
          name: 'Default',
          description: '',
        },
        inventory: {
          id: 1,
          name: 'Demo Inventory',
          description: '',
          has_active_failures: false,
          total_hosts: 4,
          hosts_with_active_failures: 0,
          total_groups: 0,
          has_inventory_sources: false,
          total_inventory_sources: 0,
          inventory_sources_with_failures: 0,
          organization_id: 1,
          kind: '',
        },
        job_template: {
          id: 9,
          name: 'Sliced Job Template',
          description: '',
        },
        unified_job_template: {
          id: 9,
          name: 'Sliced Job Template',
          description: '',
          unified_job_type: 'job',
        },
        created_by: {
          id: 1,
          username: 'admin',
          first_name: '',
          last_name: '',
        },
        modified_by: {
          id: 1,
          username: 'admin',
          first_name: '',
          last_name: '',
        },
        user_capabilities: {
          delete: true,
          start: true,
        },
        labels: {
          count: 0,
          results: [],
        },
      },
      created: '2021-07-06T19:40:17.654030Z',
      modified: '2021-07-06T19:40:17.964699Z',
      name: 'Sliced Job Template',
      description: '',
      unified_job_template: 9,
      launch_type: 'manual',
      status: 'successful',
      failed: false,
      started: '2021-07-06T19:40:17.962019Z',
      finished: '2021-07-06T19:40:42.238563Z',
      canceled_on: null,
      elapsed: 24.277,
      job_explanation: '',
      launched_by: {
        id: 1,
        name: 'admin',
        type: 'user',
        url: '/api/v2/users/1/',
      },
      work_unit_id: null,
      workflow_job_template: null,
      extra_vars: '{}',
      allow_simultaneous: false,
      job_template: 9,
      is_sliced_job: true,
      inventory: 1,
      limit: '',
      scm_branch: '',
      webhook_service: '',
      webhook_credential: null,
      webhook_guid: '',
    };
    renderWithContexts(<JobDetail job={workFlowJob} />);
    expect(detailValue('Status')).toHaveTextContent('Successful');
    assertDetail('Started', '7/6/2021, 7:40:17 PM');
    assertDetail('Finished', '7/6/2021, 7:40:42 PM');
    assertDetail('Job Template', 'Sliced Job Template');
    assertDetail('Job Type', 'Workflow Job');
    assertDetail('Inventory', 'Demo Inventory');
    assertDetail('Job Slice Parent', 'True');
  });

  test('should not load Source', () => {
    renderWithContexts(
      <JobDetail
        job={{
          ...mockJobData,
          summary_fields: {
            inventory_source: {},
            user_capabilities: {},
            inventory: { id: 1 },
          },
        }}
        inventorySourceLabels={[]}
      />
    );
    // The inventory-source "Source" detail is isEmpty (no labels supplied) and
    // therefore renders nothing — its value cell (data-cy job-inventory-source-
    // type) is absent. (A separate project-fallback "Source" label may still
    // render, so we assert on the inventory-source detail specifically.)
    expect(
      document.querySelector('[data-cy="job-inventory-source-type"]')
    ).not.toBeInTheDocument();
  });

  test('should not load Credentials', () => {
    renderWithContexts(
      <JobDetail
        job={{
          ...mockJobData,
          summary_fields: {
            user_capabilities: {},
            credentials: [],
          },
        }}
      />
    );
    // An empty Credentials detail (isEmpty) is not rendered.
    expect(screen.queryByText('Credentials')).not.toBeInTheDocument();
  });

  test('should not load Job Tags', () => {
    renderWithContexts(
      <JobDetail
        job={{
          ...mockJobData,
          job_tags: '',
        }}
      />
    );
    expect(screen.queryByText('Job Tags')).not.toBeInTheDocument();
  });

  test('should not load Skip Tags', () => {
    renderWithContexts(
      <JobDetail
        job={{
          ...mockJobData,
          skip_tags: '',
        }}
      />
    );
    expect(screen.queryByText('Skip Tags')).not.toBeInTheDocument();
  });
});
