import type { UnifiedJob } from 'types/api';
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import { UnifiedJobsAPI } from 'api';
import type { QSParams } from 'util/qs';
import { formatDateString } from 'util/dates';
import type { ResponseOf } from '../../../testUtils/responseOf';

import type {
  RenderWithContextsOptions,
  TestUser,
} from '../../../testUtils/rtlContexts';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import JobListItem from './JobListItem';
import { getJobListQSConfig } from './qsConfig';

/** What within() and a render result both offer: the bound queries. */
type QueryScope = ReturnType<typeof within>;

const mockJob = {
  id: 123,
  type: 'job',
  url: '/api/v2/jobs/123/',
  summary_fields: {
    user_capabilities: {
      delete: true,
      start: true,
    },
    schedule: {
      name: 'mock schedule',
      id: 999,
    },
    unified_job_template: {
      unified_job_type: 'job',
      id: 1,
    },
  },
  created: '2019-08-08T19:24:05.344276Z',
  modified: '2019-08-08T19:24:18.162949Z',
  name: 'Demo Job Template',
  job_type: 'run',
  launch_type: 'scheduled',
  started: '2019-08-08T19:24:18.329589Z',
  finished: '2019-08-08T19:24:50.119995Z',
  status: 'successful',
  job_slice_number: 1,
  job_slice_count: 3,
  execution_environment: 1,
} as unknown as UnifiedJob;

function renderItem(
  ui: React.ReactElement,
  options?: RenderWithContextsOptions
) {
  return renderWithContexts(
    <table>
      <tbody>{ui}</tbody>
    </table>,
    options
  );
}

// A non-failed job renders the plain "Relaunch" button; a failed playbook run
// renders the relaunch dropdown whose toggle is labelled "relaunch jobs". This
// returns whichever launch control is present.
function queryLaunchButton(scope: QueryScope) {
  return (
    scope.queryByRole('button', { name: 'Relaunch' }) ||
    scope.queryByRole('button', { name: 'relaunch jobs' })
  );
}

// Detail renders <dt>label</dt><dd>value</dd>; scope to the render so multiple
// rows from earlier renders in the same test don't collide.
function assertDetail(scope: QueryScope, label: string, value: string) {
  const term = scope.getByText(label);
  expect(term.nextElementSibling).toHaveTextContent(value);
}

// The list row is always rendered with the full set; each test spreads these
// and overrides only what it is checking.
const defaultProps = {
  isExpanded: false,
  onExpand: () => {},
  isSelected: false,
  onSelect: () => {},
  rowIndex: 0,
  inventorySourceLabels: [],
};

describe('<JobListItem />', () => {
  let container: HTMLElement;

  beforeEach(() => {
    const history = createMemoryHistory({
      initialEntries: ['/jobs'],
    });
    ({ container } = renderItem(
      <JobListItem
        {...defaultProps}
        job={mockJob}
        isSelected
        onSelect={() => {}}
      />,
      {
        context: { router: { history } },
      }
    ));
  });

  test('initially renders successfully', () => {
    expect(
      within(container).getByRole('link', { name: /Demo Job Template/ })
    ).toBeInTheDocument();
  });

  test('should show the ID in its own cell, not in the name link', () => {
    expect(container.querySelector('td[data-label="ID"]')).toHaveTextContent(
      /^123$/
    );
    // an exact name: the link no longer carries the ID prefix
    expect(
      within(container).getByRole('link', { name: 'Demo Job Template' })
    ).toBeInTheDocument();
  });

  test('should display expected details', () => {
    // Detail rows live in the (always-rendered) expandable row content.
    assertDetail(within(container), 'Job Slice', '1/3');
    assertDetail(within(container), 'Schedule', 'mock schedule');
  });

  test('launch button shown to users with launch capabilities', () => {
    expect(queryLaunchButton(within(container))).toBeInTheDocument();
  });

  test('should render source data in expanded view', () => {
    const { container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        isExpanded
        inventorySourceLabels={[
          ['scm', 'Sourced from Project'],
          ['file', 'File, Directory or Script'],
        ]}
        job={
          {
            ...mockJob,
            type: 'inventory_update',
            source: 'scm',
            summary_fields: { user_capabilities: { start: false } },
          } as unknown as UnifiedJob
        }
        detailUrl={`/jobs/playbook/${mockJob.id}`}
        onSelect={() => {}}
        isSelected={false}
      />
    );
    const sourceValue = c.querySelector(
      'dd[data-cy="job-inventory-source-type-value"]'
    );
    expect(sourceValue).toHaveTextContent('Sourced from Project');
  });

  test('launch button hidden from users without launch capabilities', () => {
    const { container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={
          {
            ...mockJob,
            summary_fields: { user_capabilities: { start: false } },
          } as unknown as UnifiedJob
        }
        detailUrl={`/jobs/playbook/${mockJob.id}`}
        onSelect={() => {}}
        isSelected={false}
      />
    );
    expect(queryLaunchButton(within(c))).not.toBeInTheDocument();
  });

  test('should hide type column when showTypeColumn is false', () => {
    expect(
      container.querySelector('td[data-label="Type"]')
    ).not.toBeInTheDocument();
    // the expanded row spans every column after expand + select
    expect(
      container.querySelector('tr[id="expanded-job-row-123"] > td:nth-child(2)')
    ).toHaveAttribute('colspan', '6');
  });

  test('should show type column when showTypeColumn is true', () => {
    const { container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={mockJob}
        showTypeColumn
        isSelected
        onSelect={() => {}}
      />
    );
    expect(c.querySelector('td[data-label="Type"]')).toBeInTheDocument();
    expect(
      c.querySelector('tr[id="expanded-job-row-123"] > td:nth-child(2)')
    ).toHaveAttribute('colspan', '7');
  });

  test('should not show schedule detail in expanded view', () => {
    // summary_fields has no schedule, but launch_type is scheduled, so the
    // DeletedDetail still renders a "Schedule" label.
    const { container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={
          {
            ...mockJob,
            summary_fields: {},
          } as unknown as UnifiedJob
        }
        showTypeColumn
        isSelected
        onSelect={() => {}}
      />
    );
    expect(within(c).getByText('Schedule')).toBeInTheDocument();
  });

  test('should not display EE for canceled jobs', () => {
    const { container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={
          {
            ...mockJob,
            status: 'canceled',
            execution_environment: null,
          } as unknown as UnifiedJob
        }
        showTypeColumn
        isSelected
        onSelect={() => {}}
      />
    );
    expect(
      within(c).queryByText('Execution Environment')
    ).not.toBeInTheDocument();
  });

  test('should display missing resource for completed jobs and missing EE', () => {
    const { container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={mockJob}
        showTypeColumn
        isSelected
        onSelect={() => {}}
      />
    );
    assertDetail(within(c), 'Execution Environment', 'Missing resource');
  });

  test('should not load Source', () => {
    // isEmpty Source detail renders nothing -> no "Source" label in the DOM.
    const { container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        inventorySourceLabels={[]}
        job={
          {
            ...mockJob,
            type: 'inventory_update',
            summary_fields: {
              user_capabilities: {},
            },
          } as unknown as UnifiedJob
        }
      />
    );
    expect(within(c).queryByText('Source')).not.toBeInTheDocument();
  });

  test('should not load Credentials', () => {
    // empty credentials -> isEmpty Detail renders nothing.
    const { container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={
          {
            ...mockJob,
            type: 'inventory_update',
            summary_fields: {
              credentials: [],
            },
          } as unknown as UnifiedJob
        }
      />
    );
    expect(within(c).queryByText('Credentials')).not.toBeInTheDocument();
  });
});

describe('<JobListItem with failed job />', () => {
  let user: TestUser;
  let container: HTMLElement;

  beforeEach(() => {
    const history = createMemoryHistory({
      initialEntries: ['/jobs'],
    });
    ({ user, container } = renderItem(
      <JobListItem
        {...defaultProps}
        job={{ ...mockJob, status: 'failed' } as unknown as UnifiedJob}
        isSelected
        onSelect={() => {}}
      />,
      { context: { router: { history } } }
    ));
  });

  test('launch button shown to users with launch capabilities', () => {
    expect(queryLaunchButton(within(container))).toBeInTheDocument();
  });

  test('dropdown should be displayed in case of failed job', async () => {
    const toggle = within(container).getByRole('button', {
      name: 'relaunch jobs',
    });
    expect(toggle).toBeInTheDocument();
    // menu closed -> no items
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);

    await user.click(toggle);
    // the menu renders via a PF popper appended to document.body, so the items
    // can appear asynchronously after the click; await them
    expect(await screen.findAllByRole('menuitem')).toHaveLength(3);
  });

  test('dropdown should not be rendered for job type different of playbook run', () => {
    const { container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={
          {
            ...mockJob,
            status: 'failed',
            type: 'project_update',
          } as unknown as UnifiedJob
        }
        onSelect={() => {}}
        isSelected
      />
    );
    // a project_update renders the plain Relaunch button, not the dropdown
    expect(
      within(c).queryByRole('button', { name: 'relaunch jobs' })
    ).toBeNull();
    expect(
      within(c).getByRole('button', { name: 'Relaunch' })
    ).toBeInTheDocument();
  });

  test('launch button hidden from users without launch capabilities', () => {
    const { container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={
          {
            ...mockJob,
            status: 'failed',
            summary_fields: { user_capabilities: { start: false } },
          } as unknown as UnifiedJob
        }
        detailUrl={`/jobs/playbook/${mockJob.id}`}
        onSelect={() => {}}
        isSelected={false}
      />
    );
    expect(queryLaunchButton(within(c))).not.toBeInTheDocument();
  });
});

describe('<JobListItem stack variant />', () => {
  const qsConfig = getJobListQSConfig();
  const search = '?job.page=2&job.status=running';
  const params = { page: 2, status: 'running' } as QSParams;

  const stackJob = {
    ...mockJob,
    id: 12,
    name: 'Deploy app',
    type: 'job',
    status: 'running',
    started: '2019-08-08T19:24:18.329589Z',
    finished: null,
    stack: {
      count: 5,
      status_counts: { new: 0, waiting: 2, pending: 0, running: 3 },
      template: {
        id: 12,
        name: 'Deploy app',
        project: { id: 3, name: 'Web' },
        organization: { id: 1, name: 'Default' },
      },
    },
  } as unknown as UnifiedJob;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('renders status chips with counts and an empty selection cell', () => {
    const { container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={stackJob}
        showTypeColumn
        qsConfig={qsConfig}
        search={search}
        params={params}
      />
    );

    const row = c.querySelector('#job-row-12') as HTMLElement;
    expect(row).not.toBeNull();
    // stack rows are not selectable
    expect(within(row).queryByRole('checkbox')).toBeNull();
    expect(within(row).getByText('12')).toBeInTheDocument();
    // zero counts are omitted and the order is fixed
    expect(within(row).getByText('Waiting 2')).toBeInTheDocument();
    expect(within(row).getByText('Running 3')).toBeInTheDocument();
    expect(within(row).queryByText(/New/)).not.toBeInTheDocument();
    expect(within(row).queryByText(/Pending/)).not.toBeInTheDocument();
    expect(within(row).getByText('Playbook Run')).toBeInTheDocument();
    expect(
      within(row).getByText(formatDateString(stackJob.started) as string)
    ).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: 'Cancel stack' })
    ).toBeInTheDocument();
  });

  test('links the name to the template-filtered Jobs list', () => {
    const { container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={stackJob}
        qsConfig={qsConfig}
        search={search}
        params={params}
      />
    );

    const row = c.querySelector('#job-row-12') as HTMLElement;
    const link = within(row).getByRole('link', { name: 'Deploy app' });
    expect(link).toHaveAttribute('href', expect.stringMatching(/^\/jobs\?/));
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('job.unified_job_template=12')
    );
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('job.status=running')
    );
    // resetting page removes the stale page=2 from the current URL
    expect(link.getAttribute('href')).not.toContain('job.page=2');
  });

  test('removes grouping and stale template filters from the template link', () => {
    const { container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={stackJob}
        qsConfig={qsConfig}
        search="?group_by=template&job.unified_job_template__in=12,99&job.not__unified_job_template=5&job.or__not__unified_job_template=6&job.not__unified_job_template__in=7,8&job.page=2&job.status=running"
        params={params}
      />
    );

    const row = c.querySelector('#job-row-12') as HTMLElement;
    const href = within(row)
      .getByRole('link', { name: 'Deploy app' })
      .getAttribute('href');

    expect(href).toContain('job.unified_job_template=12');
    expect(href).toContain('job.status=running');
    expect(href).not.toContain('group_by');
    expect(href).not.toContain('unified_job_template__in');
    expect(href).not.toContain('not__unified_job_template');
    expect(href).not.toContain('job.page=2');
  });

  test('expands to the stack-level template, project and organization', () => {
    const { container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={stackJob}
        isExpanded
        qsConfig={qsConfig}
        search={search}
        params={params}
      />
    );

    const expanded = c.querySelector('#expanded-job-row-12') as HTMLElement;
    expect(
      within(expanded).getByRole('link', { name: 'Deploy app' })
    ).toHaveAttribute('href', '/templates/job_template/12');
    expect(within(expanded).getByRole('link', { name: 'Web' })).toHaveAttribute(
      'href',
      '/projects/3/details'
    );
    expect(
      within(expanded).getByRole('link', { name: 'Default' })
    ).toHaveAttribute('href', '/organizations/1/details');
  });

  test('uses a workflow template route and hides the project for workflows', () => {
    const workflowStack = {
      ...stackJob,
      type: 'workflow_job',
      stack: {
        ...stackJob.stack,
        template: {
          id: 12,
          name: 'Deploy app',
          organization: { id: 1, name: 'Default' },
        },
      },
    } as unknown as UnifiedJob;
    const { container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={workflowStack}
        isExpanded
        qsConfig={qsConfig}
        search={search}
        params={params}
      />
    );

    const expanded = c.querySelector('#expanded-job-row-12') as HTMLElement;
    expect(
      within(expanded).getByRole('link', { name: 'Deploy app' })
    ).toHaveAttribute('href', '/templates/workflow_job_template/12');
    expect(within(expanded).queryByText('Project')).not.toBeInTheDocument();
  });

  test('falls back when the template metadata is missing', () => {
    const bareStack = {
      ...stackJob,
      stack: {
        count: 2,
        status_counts: { running: 2 },
        template: { id: 12 },
      },
    } as unknown as UnifiedJob;
    const { container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={bareStack}
        isExpanded
        qsConfig={qsConfig}
        search={search}
        params={params}
      />
    );

    expect(within(c).getByText('Template 12')).toBeInTheDocument();
    expect(within(c).queryByText('Project')).not.toBeInTheDocument();
    expect(within(c).queryByText('Organization')).not.toBeInTheDocument();
  });

  test('cancels the stack and loops while jobs remain', async () => {
    const cancelStack = vi
      .spyOn(UnifiedJobsAPI, 'cancelStack')
      .mockResolvedValueOnce({
        data: {
          canceled: 2,
          skipped: 1,
          skipped_ids: [99],
          remaining: 2,
          next_before_id: 5,
        },
      } as unknown as ResponseOf<typeof UnifiedJobsAPI.cancelStack>)
      .mockResolvedValueOnce({
        data: {
          canceled: 2,
          skipped: 0,
          skipped_ids: [],
          remaining: 0,
          next_before_id: null,
        },
      } as unknown as ResponseOf<typeof UnifiedJobsAPI.cancelStack>);

    const { user, container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={stackJob}
        qsConfig={qsConfig}
        search={search}
        params={params}
      />
    );

    await user.click(within(c).getByRole('button', { name: 'Cancel stack' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('This action will cancel 5 jobs of:')
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Deploy app')).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', { name: 'Confirm cancel stack' })
    );

    await waitFor(() => expect(cancelStack).toHaveBeenCalledTimes(2));
    expect(cancelStack).toHaveBeenNthCalledWith(1, params, 12, undefined);
    expect(cancelStack).toHaveBeenNthCalledWith(2, params, 12, 5);
    expect(
      await screen.findByText('Some jobs were not canceled')
    ).toBeInTheDocument();
  });

  test('keeps looping when a chunk contains only skipped jobs', async () => {
    const cancelStack = vi
      .spyOn(UnifiedJobsAPI, 'cancelStack')
      .mockResolvedValueOnce({
        data: {
          canceled: 0,
          skipped: 2,
          skipped_ids: [98, 99],
          remaining: 3,
          next_before_id: 5,
        },
      } as unknown as ResponseOf<typeof UnifiedJobsAPI.cancelStack>)
      .mockResolvedValueOnce({
        data: {
          canceled: 3,
          skipped: 0,
          skipped_ids: [],
          remaining: 0,
          next_before_id: null,
        },
      } as unknown as ResponseOf<typeof UnifiedJobsAPI.cancelStack>);

    const { user, container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={stackJob}
        qsConfig={qsConfig}
        search={search}
        params={params}
      />
    );

    await user.click(within(c).getByRole('button', { name: 'Cancel stack' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Confirm cancel stack' })
    );

    await waitFor(() => expect(cancelStack).toHaveBeenCalledTimes(2));
    expect(cancelStack).toHaveBeenNthCalledWith(1, params, 12, undefined);
    expect(cancelStack).toHaveBeenNthCalledWith(2, params, 12, 5);
    expect(
      await screen.findByText('Some jobs were not canceled')
    ).toBeInTheDocument();
  });

  test('disables the stack cancel button while a cancel loop is running', async () => {
    let release!: () => void;
    const cancelStack = vi
      .spyOn(UnifiedJobsAPI, 'cancelStack')
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            release = () =>
              resolve({
                data: {
                  canceled: 1,
                  skipped: 0,
                  skipped_ids: [],
                  remaining: 0,
                  next_before_id: null,
                },
              } as unknown as ResponseOf<typeof UnifiedJobsAPI.cancelStack>);
          })
      );

    const { user, container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={stackJob}
        qsConfig={qsConfig}
        search={search}
        params={params}
      />
    );

    const button = within(c).getByRole('button', { name: 'Cancel stack' });
    await user.click(button);
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Confirm cancel stack' })
    );

    await waitFor(() => expect(cancelStack).toHaveBeenCalledTimes(1));
    expect(button).toBeDisabled();
    // A second click while the loop is in flight must not start another one.
    await user.click(button);
    expect(cancelStack).toHaveBeenCalledTimes(1);

    release();
    await waitFor(() => expect(button).toBeEnabled());
  });

  test('shows an error when the stack cancel request fails', async () => {
    vi.spyOn(UnifiedJobsAPI, 'cancelStack').mockRejectedValue(
      Object.assign(new Error('An error occurred'), {
        response: {
          config: {
            method: 'post',
            url: '/api/v2/unified_jobs/stacks/cancel/',
          },
          data: 'An error occurred',
        },
      })
    );

    const { user, container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={stackJob}
        qsConfig={qsConfig}
        search={search}
        params={params}
      />
    );

    await user.click(within(c).getByRole('button', { name: 'Cancel stack' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm cancel stack' })
    );

    expect(await screen.findByText('Job Cancel Error')).toBeInTheDocument();
    expect(
      await screen.findByText('Failed to cancel the stack.')
    ).toBeInTheDocument();
  });
});

describe('<JobListItem status group variant />', () => {
  const qsConfig = getJobListQSConfig();
  const search = '?job.page=2&group_by=status';

  const statusGroupJob = {
    ...mockJob,
    id: 12,
    name: 'Pending job',
    type: 'job',
    status: 'pending',
    started: null,
    finished: null,
    status_group: {
      status: 'pending',
      count: 12,
    },
  } as unknown as UnifiedJob;

  test('renders the status group title and chip', () => {
    const { container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={statusGroupJob}
        qsConfig={qsConfig}
        search={search}
      />
    );

    const row = c.querySelector('#job-row-status-pending') as HTMLElement;
    expect(row).not.toBeNull();
    // Status group rows are not selectable
    expect(within(row).queryByRole('checkbox')).toBeNull();
    // The title says "Pending jobs"
    expect(within(row).getByText('Pending jobs')).toBeInTheDocument();
    // The chip shows "Pending 12"
    expect(within(row).getByText('Pending 12')).toBeInTheDocument();
  });

  test('links the title to the status-filtered Jobs list', () => {
    const { container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={statusGroupJob}
        qsConfig={qsConfig}
        search={search}
      />
    );

    const row = c.querySelector('#job-row-status-pending') as HTMLElement;
    const link = within(row).getByRole('link', { name: 'Pending jobs' });
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining('status=pending')
    );
  });

  test('clears conflicting status filters when linking to a status', () => {
    const { container: c } = renderItem(
      <JobListItem
        {...defaultProps}
        job={statusGroupJob}
        qsConfig={qsConfig}
        search="?group_by=status&job.or__status=running&job.status__in=failed,error&job.not__status=pending&job.or__not__status=waiting&job.not__status__in=canceled,error"
      />
    );

    const row = c.querySelector('#job-row-status-pending') as HTMLElement;
    const link = within(row).getByRole('link', { name: 'Pending jobs' });
    const href = link.getAttribute('href') ?? '';
    expect(href).toContain('status=pending');
    expect(href).not.toContain('or__status');
    expect(href).not.toContain('status__in');
    expect(href).not.toContain('not__status');
  });
});
