import type { Untyped } from 'types/api';
import type { ApiResponse } from 'api/Base';
import React from 'react';
import { waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import { ProjectUpdatesAPI, WorkflowJobsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import Job from './Job';

vi.mock('../../api');
// Job reads useParams from react-router-dom (the route tree is v6);
// mock it there, keeping the rest of the module real.
vi.mock('react-router', async () => ({
  ...(await vi.importActual<typeof import('react-router')>('react-router')),
  useParams: () => ({
    id: 1,
    typeSegment: 'project',
  }),
}));

describe('<Job />', () => {
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
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(ProjectUpdatesAPI.readEventOptions).mockResolvedValue({
      data: {},
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(WorkflowJobsAPI.readNodes).mockResolvedValue({
      data: { results: [] },
    } as unknown as ApiResponse<Untyped>);

    renderWithContexts(<Job setBreadcrumb={() => {}} />);

    // the API's default page is 25 nodes, which truncates the menu for large
    // (e.g. heavily sliced) workflows; the fetch must ask for MAX_PAGE_SIZE
    await waitFor(() =>
      expect(WorkflowJobsAPI.readNodes).toHaveBeenCalledWith(99, {
        page_size: 200,
      })
    );
  });
});
