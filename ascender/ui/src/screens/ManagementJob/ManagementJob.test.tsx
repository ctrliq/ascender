import type { SystemJobTemplate } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { OrganizationsAPI, SystemJobTemplatesAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ManagementJob from './ManagementJob';

vi.mock('../../api/models/Organizations');
vi.mock('../../api/models/SystemJobTemplates');

// The runs list reads the api on its own; what matters here is what it is
// handed, so it stands in as the filter it was given.
vi.mock('components/JobList', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: ({ defaultParams }: { defaultParams: Record<string, unknown> }) =>
      ReactLib.createElement(
        'div',
        null,
        `JobList ${JSON.stringify(defaultParams)}`
      ),
  };
});

// Stands in as whether it was told the toggles may be used.
vi.mock('components/NotificationList', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: ({
      canToggleNotifications,
    }: {
      canToggleNotifications: boolean;
    }) =>
      ReactLib.createElement(
        'div',
        null,
        `NotificationList toggles ${canToggleNotifications ? 'on' : 'off'}`
      ),
  };
});

const cleanupJob = {
  id: 2,
  type: 'system_job_template',
  name: 'Cleanup Activity Stream',
  description: 'Remove activity stream history',
  last_job_run: '2026-09-27T01:13:25.590559Z',
  next_job_run: '2026-09-29T20:16:20Z',
  created: '2026-05-11T20:16:20.810295Z',
  modified: '2026-05-11T20:16:20.810295Z',
  summary_fields: {
    last_job: { id: 1407, status: 'successful' },
    resolved_environment: { id: 1, name: 'Ascender EE (latest)' },
  },
} as unknown as SystemJobTemplate;

function renderManagementJob(
  initialEntry: string,
  me: Record<string, unknown> = { is_superuser: true }
) {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const rendered = renderWithContexts(
    <Routes>
      <Route
        path="/cleanup_jobs/:id/*"
        element={<ManagementJob setBreadcrumb={() => {}} />}
      />
    </Routes>,
    { context: { router: { history }, config: { me } } }
  );
  return { ...rendered, history };
}

describe('<ManagementJob />', () => {
  beforeEach(() => {
    vi.mocked(SystemJobTemplatesAPI.readDetail).mockResolvedValue({
      data: cleanupJob,
    } as unknown as ResponseOf<typeof SystemJobTemplatesAPI.readDetail>);
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      data: { results: [{ id: 1 }] },
    } as unknown as ResponseOf<typeof OrganizationsAPI.read>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('opens on its details, with its runs as the last tab', async () => {
    const { history } = renderManagementJob('/cleanup_jobs/2');

    expect(
      await screen.findByText('Remove activity stream history')
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(history.location.pathname).toBe('/cleanup_jobs/2/details')
    );
    expect(
      screen.getAllByRole('tab').map((tab) => tab.textContent?.trim())
    ).toEqual([
      'Back to Cleanup Jobs',
      'Details',
      'Notifications',
      'Schedules',
      'Runs',
    ]);
  });

  test('shows when it last ran, how that went, and where it runs', async () => {
    renderManagementJob('/cleanup_jobs/2/details');

    expect(await screen.findByText('Ascender EE (latest)')).toHaveAttribute(
      'href',
      '/execution_environments/1/details'
    );
    expect(screen.getByText('Last Run')).toBeInTheDocument();
    expect(screen.getByText('Next Run')).toBeInTheDocument();
    // The status label is the link, to the run that set it.
    expect(
      document.querySelector('a[href="/runs/management/1407/output"]')
    ).not.toBeNull();
  });

  test('lists its own runs', async () => {
    renderManagementJob('/cleanup_jobs/2/runs');

    expect(
      await screen.findByText('JobList {"unified_job_template":2}')
    ).toBeInTheDocument();
  });

  test('offers a superuser the notifications on an install with no organizations', async () => {
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      data: { results: [] },
    } as unknown as ResponseOf<typeof OrganizationsAPI.read>);
    renderManagementJob('/cleanup_jobs/2/notifications');

    expect(
      await screen.findByText('NotificationList toggles on')
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Notifications' })).toBeVisible();
  });

  test('shows a notification admin the list without toggles the api refuses', async () => {
    renderManagementJob('/cleanup_jobs/2/notifications', {
      is_superuser: false,
    });

    expect(
      await screen.findByText('NotificationList toggles off')
    ).toBeInTheDocument();
  });

  test('leaves a space before the link out of a missing job', async () => {
    vi.mocked(SystemJobTemplatesAPI.readDetail).mockRejectedValue(
      Object.assign(new Error('not found'), { response: { status: 404 } })
    );
    renderManagementJob('/cleanup_jobs/2/details');

    const link = await screen.findByRole('link', {
      name: 'View all Cleanup Jobs.',
    });
    expect(link.parentElement).toHaveTextContent(
      'Cleanup Job not found. View all Cleanup Jobs.'
    );
  });

  test('says an unknown tab is not found rather than showing an empty card', async () => {
    renderManagementJob('/cleanup_jobs/2/nope');

    expect(
      await screen.findByRole('link', { name: 'View Cleanup Job Details' })
    ).toHaveAttribute('href', '/cleanup_jobs/2/details');
  });
});
