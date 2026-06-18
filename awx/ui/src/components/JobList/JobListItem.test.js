import React from 'react';
import { screen, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import { renderWithContexts } from '../../../testUtils/rtlContexts';

import JobListItem from './JobListItem';

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
};

function renderItem(ui, options) {
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
function queryLaunchButton(scope) {
  return (
    scope.queryByRole('button', { name: 'Relaunch' }) ||
    scope.queryByRole('button', { name: 'relaunch jobs' })
  );
}

// Detail renders <dt>label</dt><dd>value</dd>; scope to the render so multiple
// rows from earlier renders in the same test don't collide.
function assertDetail(scope, label, value) {
  const term = scope.getByText(label);
  expect(term.nextElementSibling).toHaveTextContent(value);
}

describe('<JobListItem />', () => {
  let container;

  beforeEach(() => {
    const history = createMemoryHistory({
      initialEntries: ['/jobs'],
    });
    ({ container } = renderItem(
      <JobListItem job={mockJob} isSelected onSelect={() => {}} />,
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
        isExpanded
        inventorySourceLabels={[
          ['scm', 'Sourced from Project'],
          ['file', 'File, Directory or Script'],
        ]}
        job={{
          ...mockJob,
          type: 'inventory_update',
          source: 'scm',
          summary_fields: { user_capabilities: { start: false } },
        }}
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
        job={{
          ...mockJob,
          summary_fields: { user_capabilities: { start: false } },
        }}
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
  });

  test('should show type column when showTypeColumn is true', () => {
    const { container: c } = renderItem(
      <JobListItem job={mockJob} showTypeColumn isSelected onSelect={() => {}} />
    );
    expect(c.querySelector('td[data-label="Type"]')).toBeInTheDocument();
  });

  test('should not show schedule detail in expanded view', () => {
    // summary_fields has no schedule, but launch_type is scheduled, so the
    // DeletedDetail still renders a "Schedule" label.
    const { container: c } = renderItem(
      <JobListItem
        job={{
          ...mockJob,
          summary_fields: {},
        }}
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
        job={{
          ...mockJob,
          status: 'canceled',
          execution_environment: null,
        }}
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
      <JobListItem job={mockJob} showTypeColumn isSelected onSelect={() => {}} />
    );
    assertDetail(within(c), 'Execution Environment', 'Missing resource');
  });

  test('should not load Source', () => {
    // isEmpty Source detail renders nothing -> no "Source" label in the DOM.
    const { container: c } = renderItem(
      <JobListItem
        inventorySourceLabels={[]}
        job={{
          ...mockJob,
          type: 'inventory_update',
          summary_fields: {
            user_capabilities: {},
          },
        }}
      />
    );
    expect(within(c).queryByText('Source')).not.toBeInTheDocument();
  });

  test('should not load Credentials', () => {
    // empty credentials -> isEmpty Detail renders nothing.
    const { container: c } = renderItem(
      <JobListItem
        job={{
          ...mockJob,
          type: 'inventory_update',
          summary_fields: {
            credentials: [],
          },
        }}
      />
    );
    expect(within(c).queryByText('Credentials')).not.toBeInTheDocument();
  });
});

describe('<JobListItem with failed job />', () => {
  let user;
  let container;

  beforeEach(() => {
    const history = createMemoryHistory({
      initialEntries: ['/jobs'],
    });
    ({ user, container } = renderItem(
      <JobListItem
        job={{ ...mockJob, status: 'failed' }}
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
        job={{
          ...mockJob,
          status: 'failed',
          type: 'project_update',
        }}
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
        job={{
          ...mockJob,
          status: 'failed',
          summary_fields: { user_capabilities: { start: false } },
        }}
        detailUrl={`/jobs/playbook/${mockJob.id}`}
        onSelect={() => {}}
        isSelected={false}
      />
    );
    expect(queryLaunchButton(within(c))).not.toBeInTheDocument();
  });
});
