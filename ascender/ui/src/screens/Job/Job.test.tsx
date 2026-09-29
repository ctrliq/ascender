import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import {
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from '@testing-library/react';
import { ProjectUpdatesAPI, WorkflowJobsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import { createMemoryHistory } from '../../../testUtils/historyShim';

import Job from './Job';

const here = path.dirname(fileURLToPath(import.meta.url));
const jobStylesheet = fs.readFileSync(path.join(here, 'Job.css'), 'utf8');
const outputStylesheet = fs.readFileSync(
  path.join(here, 'JobOutput', 'JobOutput.css'),
  'utf8'
);

vi.mock('../../api');
// Job reads useParams from react-router-dom (the route tree is v6);
// mock it there, keeping the rest of the module real.
// The params sit in a hoisted object so a test can move the page to another
// job the way the workflow navigator does, by changing the id alone.
const routeParams = vi.hoisted(() => ({
  id: 1 as number | string,
  typeSegment: 'project',
}));
vi.mock('react-router', async () => ({
  ...(await vi.importActual<typeof import('react-router')>('react-router')),
  useParams: () => ({ ...routeParams }),
}));
// The real output reads events of its own; this one says it is ready only for
// the jobs a test lists, so a test decides when each output has drawn.
const readyOutputs = vi.hoisted(() => new Set<number>());
vi.mock('./JobOutput', async () => {
  const { useEffect } = await vi.importActual<typeof import('react')>('react');
  return {
    default: function MockJobOutput({
      job,
      onContentReady,
    }: {
      job: { id: number };
      onContentReady?: () => void;
    }) {
      useEffect(() => {
        if (readyOutputs.has(job.id)) {
          onContentReady?.();
        }
      }, [job.id, onContentReady]);
      return <div data-testid="job-output">{job.id}</div>;
    },
  };
});

describe('<Job />', () => {
  afterEach(() => {
    routeParams.id = 1;
    readyOutputs.clear();
  });

  test('initially renders successfully', async () => {
    const { container } = renderWithContexts(<Job setBreadcrumb={() => {}} />);
    // The auto-mocked api makes the initial fetch settle (into an error
    // state); wait for the ContentLoading spinner to be removed so the
    // async state update lands inside the test.
    await waitForElementToBeRemoved(() =>
      container.querySelector('[role="progressbar"]')
    );
  });

  test('requests a full page of workflow nodes for the navigation menu', async () => {
    vi.mocked(ProjectUpdatesAPI.readDetail).mockResolvedValue({
      data: {
        id: 1,
        type: 'project_update',
        related: { source_workflow_job: '/api/v2/workflow_jobs/99/' },
        summary_fields: { source_workflow_job: { id: 99 } },
      },
    } as unknown as ResponseOf<typeof ProjectUpdatesAPI.readDetail>);
    vi.mocked(ProjectUpdatesAPI.readEventOptions).mockResolvedValue({
      data: {},
    } as unknown as ResponseOf<typeof ProjectUpdatesAPI.readEventOptions>);
    vi.mocked(WorkflowJobsAPI.readNodes).mockResolvedValue({
      data: { results: [] },
    } as unknown as ResponseOf<typeof WorkflowJobsAPI.readNodes>);

    renderWithContexts(<Job setBreadcrumb={() => {}} />);

    // the API's default page is 25 nodes, which truncates the menu for large
    // (e.g. heavily sliced) workflows; the fetch must ask for MAX_PAGE_SIZE
    await waitFor(() =>
      expect(WorkflowJobsAPI.readNodes).toHaveBeenCalledWith(99, {
        page_size: 200,
      })
    );
  });

  /*
   * A job launched by a workflow is read from inside that workflow's run, and
   * the only way back to it was a detail halfway down the Details tab. The tab
   * bar carries it now, beside the selector that walks the run's other jobs.
   */
  test('should offer the way back to the workflow that launched it', async () => {
    vi.mocked(ProjectUpdatesAPI.readDetail).mockResolvedValue({
      data: {
        id: 1,
        type: 'project_update',
        related: { source_workflow_job: '/api/v2/workflow_jobs/99/' },
        summary_fields: { source_workflow_job: { id: 99, name: 'converge' } },
      },
    } as unknown as ResponseOf<typeof ProjectUpdatesAPI.readDetail>);
    vi.mocked(ProjectUpdatesAPI.readEventOptions).mockResolvedValue({
      data: {},
    } as unknown as ResponseOf<typeof ProjectUpdatesAPI.readEventOptions>);
    vi.mocked(WorkflowJobsAPI.readNodes).mockResolvedValue({
      data: { results: [{ id: 5, summary_fields: { job: { id: 1 } } }] },
    } as unknown as ResponseOf<typeof WorkflowJobsAPI.readNodes>);

    renderWithContexts(<Job setBreadcrumb={() => {}} />);

    const link = await screen.findByRole('link', { name: /back to workflow/i });
    // the app routes on the hash, which the test's memory router leaves off
    expect(link).toHaveAttribute('href', '/runs/workflow/99/output');
  });

  test('should not offer it on a job no workflow launched', async () => {
    vi.mocked(ProjectUpdatesAPI.readDetail).mockResolvedValue({
      data: { id: 1, type: 'project_update', related: {}, summary_fields: {} },
    } as unknown as ResponseOf<typeof ProjectUpdatesAPI.readDetail>);
    vi.mocked(ProjectUpdatesAPI.readEventOptions).mockResolvedValue({
      data: {},
    } as unknown as ResponseOf<typeof ProjectUpdatesAPI.readEventOptions>);

    const { container } = renderWithContexts(<Job setBreadcrumb={() => {}} />);
    await waitFor(() =>
      expect(ProjectUpdatesAPI.readDetail).toHaveBeenCalled()
    );

    expect(
      screen.queryByRole('link', { name: /back to workflow/i })
    ).toBeNull();
    expect(WorkflowJobsAPI.readNodes).not.toHaveBeenCalled();
    expect(container).toBeTruthy();
  });

  /*
   * Both output cards used to count their own height off the window: 160 pixels
   * of chrome for the workflow graph and 267 for the playbook output, where the
   * page has 199. The graph ran past the bottom of the window at every size and
   * the two cards ended on different lines. They fill what the page has left
   * now, so they end on the same one at every size, and neither number can
   * drift out of step with the chrome again.
   *
   * jsdom lays nothing out and applies no stylesheet, so the files are what a
   * test here can hold on to.
   */
  test('should fill the page rather than count a height off the window', () => {
    expect(jobStylesheet).not.toMatch(/height:\s*calc\(100vh/);
    expect(outputStylesheet).not.toMatch(/height:\s*calc\(100vh/);

    ['__fill-section', '__fill ', '__fill-card'].forEach((name) => {
      const rule = jobStylesheet
        .split('}')
        .find((block) => block.split('{')[0]?.includes(`ascender-job${name}`));
      expect(rule).toMatch(/flex:\s*1 1 auto;/);
      expect(rule).toMatch(/min-height:\s*0;/);
    });

    const body = outputStylesheet
      .split('}')
      .find((block) =>
        block.split('{')[0]?.includes('.ascender-job-output__card-body')
      );
    expect(body).toMatch(/flex:\s*1 1 auto;/);
    expect(body).toMatch(/min-height:\s*0;/);
  });

  /*
   * The card that fills the page is a flex column, and the output under the tab
   * bar asks for everything it can get: without this the bar was squeezed from
   * forty five pixels to twenty two and read as clipped by the top of the card.
   * The rule has to name both shapes of bar, the tabs alone and the wrapper
   * they take when the workflow selector sits beside them.
   */
  test('should keep the tab bar its own height on a filling card', () => {
    const rule = jobStylesheet
      .split('}')
      .find((block) => block.split('{')[0]?.includes('__fill-card > '));

    expect(rule).toMatch(/flex-shrink:\s*0;/);
    expect(rule).toContain('.ascender-job__fill-card > .pf-v6-c-tabs');
    expect(rule).toContain(
      '.ascender-job__fill-card > .ascender-routed-tabs__tab-bar'
    );
  });
  /*
   * The workflow navigator moves this page to a sibling job by changing the id
   * alone, so the page is not remounted. Readiness used to be a flag that stayed
   * true from the first job, which uncovered the second job's output before it
   * had drawn anything.
   */
  test('should wait again for the output when the id moves to another job', async () => {
    vi.mocked(ProjectUpdatesAPI.readDetail).mockImplementation(
      async (jobId) =>
        ({
          data: {
            id: Number(jobId),
            type: 'project_update',
            related: {},
            summary_fields: {},
          },
        }) as unknown as ResponseOf<typeof ProjectUpdatesAPI.readDetail>
    );
    vi.mocked(ProjectUpdatesAPI.readEventOptions).mockResolvedValue({
      data: {},
    } as unknown as ResponseOf<typeof ProjectUpdatesAPI.readEventOptions>);
    // the page compares the id from the route, a string, to the job's own
    routeParams.id = '1';
    readyOutputs.add(1);
    const history = createMemoryHistory({ initialEntries: ['/output'] });

    const { container, rerender } = renderWithContexts(
      <Job setBreadcrumb={() => {}} />,
      { context: { router: { history } } }
    );
    await waitFor(() =>
      expect(screen.getByTestId('job-output')).toHaveTextContent('1')
    );
    await waitFor(() =>
      expect(
        container.querySelector('.ascender-job__awaiting-content')
      ).toBeNull()
    );

    routeParams.id = '2';
    rerender(<Job setBreadcrumb={() => {}} />);

    await waitFor(() =>
      expect(screen.getByTestId('job-output')).toHaveTextContent('2')
    );
    expect(
      container.querySelector('.ascender-job__awaiting-content')
    ).not.toBeNull();
  });
});
