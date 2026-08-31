import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { createMemoryHistory } from '../../../testUtils/historyShim';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import WorkflowOutputNavigation from './WorkflowOutputNavigation';

// three job nodes and one approval node; the approval is never navigable
const relatedJobs = [
  {
    id: 10,
    job: 101,
    identifier: 'e0c4a1e6-6f4a-4b1e-8f3a-000000000001',
    summary_fields: {
      job: { id: 101, name: 'Ansible', type: 'job', status: 'successful' },
    },
  },
  {
    id: 11,
    job: 102,
    identifier: 'second-node',
    summary_fields: {
      job: { id: 102, name: 'Durham', type: 'job', status: 'failed' },
    },
  },
  {
    id: 12,
    job: 103,
    identifier: 'e0c4a1e6-6f4a-4b1e-8f3a-000000000003',
    summary_fields: {
      job: {
        id: 103,
        name: 'Red hat',
        type: 'project_update',
        status: 'successful',
      },
    },
  },
  {
    id: 13,
    job: null,
    identifier: 'approve-me',
    summary_fields: {
      job: {
        id: 104,
        name: 'Approval',
        type: 'workflow_approval',
        status: 'successful',
      },
    },
  },
];

function renderAt(jobId) {
  const history = createMemoryHistory({
    initialEntries: [`/jobs/playbook/${jobId}/output`],
  });
  const ref = React.createRef();
  const utils = renderWithContexts(
    <Routes>
      <Route
        path="/jobs/:typeSegment/:id/output"
        element={
          <WorkflowOutputNavigation relatedJobs={relatedJobs} parentRef={ref} />
        }
      />
    </Routes>,
    { context: { router: { history } } }
  );
  return { ...utils, history };
}

describe('<WorkflowOutputNavigation />', () => {
  test('counts the current job among the workflow total', () => {
    renderAt(101);
    expect(screen.getByRole('button')).toHaveTextContent('1/3');
  });

  test('shows the position of the job actually being viewed', () => {
    renderAt(102);
    expect(screen.getByRole('button')).toHaveTextContent('2/3');
  });

  test('shows the position of the last job', () => {
    renderAt(103);
    expect(screen.getByRole('button')).toHaveTextContent('3/3');
  });

  test('navigates to the job picked from the menu', async () => {
    const { user, history } = renderAt(101);
    await user.click(screen.getByRole('button'));
    await waitFor(() => screen.getByText('second-node'));
    await user.click(screen.getByText('second-node'));
    await waitFor(() =>
      expect(history.location.pathname).toBe('/jobs/playbook/102/output')
    );
  });

  test('keeps the menu in step after navigating without remounting', async () => {
    const { user, history } = renderAt(101);
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('second-node'));
    await waitFor(() =>
      expect(history.location.pathname).toBe('/jobs/playbook/102/output')
    );
    // same component instance, now viewing job 102
    expect(screen.getByRole('button')).toHaveTextContent('2/3');
    await user.click(screen.getByRole('button'));
    // the menu must offer the jobs relative to where we are now
    await waitFor(() => screen.getByText('Ansible'));
    await user.click(screen.getByText('Ansible'));
    await waitFor(() =>
      expect(history.location.pathname).toBe('/jobs/playbook/101/output')
    );
  });

  test('uses the url segment matching the job type', async () => {
    const { user, history } = renderAt(101);
    await user.click(screen.getByRole('button'));
    await waitFor(() => screen.getByText('Red hat'));
    await user.click(screen.getByText('Red hat'));
    await waitFor(() =>
      expect(history.location.pathname).toBe('/jobs/project/103/output')
    );
  });
  test('leaves approval nodes and nodes that never ran out of the count', async () => {
    // relatedJobs holds 3 job nodes plus one approval; the approval must not be
    // counted, and a node with job: null never produced output to navigate to
    const { user } = renderAt(101);
    expect(screen.getByRole('button')).toHaveTextContent('1/3');
    await user.click(screen.getByRole('button'));
    await waitFor(() => screen.getByText('Ansible'));
    expect(screen.queryByText('approve-me')).not.toBeInTheDocument();
    expect(screen.queryByText('Approval')).not.toBeInTheDocument();
  });

  test('marks the job being viewed as the selected option', async () => {
    const { user } = renderAt(102);
    await user.click(screen.getByRole('button'));
    await waitFor(() => screen.getByText('second-node'));
    expect(
      screen.getByText('second-node').closest('[role="option"]')
    ).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByText('Ansible').closest('[role="option"]')
    ).toHaveAttribute('aria-selected', 'false');
  });

  test('counts failed and successful jobs from the whole workflow', async () => {
    const { user } = renderAt(101);
    await user.click(screen.getByRole('button'));
    // two successful job nodes and one failed; the approval node counts for neither
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: /Successful/ })
      ).toHaveTextContent('(2)')
    );
    expect(screen.getByRole('option', { name: /Failed/ })).toHaveTextContent(
      '(1)'
    );
  });

  test('filters the list down to the chosen status', async () => {
    const { user } = renderAt(101);
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('option', { name: /Failed/ }));
    await waitFor(() => screen.getByText('second-node'));
    // only the failed node survives the filter
    expect(screen.queryByText('Ansible')).not.toBeInTheDocument();
    expect(screen.queryByText('Red hat')).not.toBeInTheDocument();
  });

  test('picking the job already on screen is a no-op rather than a dead click', async () => {
    const { user, history } = renderAt(102);
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('second-node'));
    // the menu closes and the url is left alone
    await waitFor(() =>
      expect(screen.queryByText('Workflow Nodes')).not.toBeInTheDocument()
    );
    expect(history.location.pathname).toBe('/jobs/playbook/102/output');
  });
  test('clears the status filter when the same status is picked again', async () => {
    const { user } = renderAt(101);
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('option', { name: /Failed/ }));
    await waitFor(() =>
      expect(screen.queryByText('Ansible')).not.toBeInTheDocument()
    );
    await user.click(screen.getByRole('option', { name: /Failed/ }));
    await waitFor(() => screen.getByText('Ansible'));
  });

  test('keeps a width floor on the toggle once a status filter is on', async () => {
    const { user } = renderAt(101);
    const toggle = screen.getByRole('button');
    expect(window.getComputedStyle(toggle).minWidth).toBe('220px');

    // the toggle swaps the position text for a much shorter chip here, and the
    // menu takes its minimum width from the toggle, so the floor has to survive
    await user.click(toggle);
    await user.click(screen.getByRole('option', { name: /Failed/ }));
    await waitFor(() => expect(screen.getByText('Failed')).toBeInTheDocument());
    expect(window.getComputedStyle(screen.getByRole('button')).minWidth).toBe(
      '220px'
    );
  });

  test('does not build a url for a job type it has no route for', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/jobs/playbook/101/output'],
    });
    const ref = React.createRef();
    const oddJobs = [
      relatedJobs[0],
      {
        id: 99,
        job: 199,
        identifier: 'mystery-node',
        summary_fields: {
          job: {
            id: 199,
            name: 'Mystery',
            type: 'not_a_job_type',
            status: 'successful',
          },
        },
      },
    ];
    const { user } = renderWithContexts(
      <Routes>
        <Route
          path="/jobs/:typeSegment/:id/output"
          element={
            <WorkflowOutputNavigation relatedJobs={oddJobs} parentRef={ref} />
          }
        />
      </Routes>,
      { context: { router: { history } } }
    );
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('mystery-node'));
    // no route for that type, so it stays put rather than going to /jobs/undefined/199
    expect(history.location.pathname).toBe('/jobs/playbook/101/output');
  });
});
