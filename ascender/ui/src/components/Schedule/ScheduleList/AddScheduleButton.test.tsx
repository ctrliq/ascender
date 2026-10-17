import React from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { JobTemplatesAPI, UnifiedJobTemplatesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import AddScheduleButton from './AddScheduleButton';

vi.mock('../../../api');
/*
 * The form is the resource's own, and it is tested where it lives. Here it
 * stands in for itself, showing the step this button hands it and saying
 * whether that step would let the reader on.
 */
vi.mock('../ScheduleAdd', () => ({
  default: ({
    resource,
    firstStep,
    hasDaysToKeepField,
    launchConfig,
    onCancel,
  }: {
    resource: { name?: string };
    firstStep?: { component: React.ReactNode; enableNext?: boolean };
    hasDaysToKeepField?: boolean;
    launchConfig?: { for?: string };
    onCancel: () => void;
  }) => (
    <div>
      <div data-testid="resource">{`form for ${resource?.name ?? 'nothing'}`}</div>
      <div data-testid="prompts-for">{launchConfig?.for ?? 'none'}</div>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <div data-testid="asks-days">{String(Boolean(hasDaysToKeepField))}</div>
      <div data-testid="can-go-on">
        {String(Boolean(firstStep?.enableNext))}
      </div>
      {firstStep?.component}
    </div>
  ),
}));

const resources = [
  {
    id: 7,
    name: 'a job template',
    type: 'job_template',
    summary_fields: { user_capabilities: { schedule: true } },
  },
  {
    id: 9,
    name: 'a manual project',
    type: 'project',
    summary_fields: { user_capabilities: { schedule: false } },
  },
  {
    id: 3,
    name: 'Cleanup Job Details',
    type: 'system_job_template',
    // The api reports no such capability for these, which is not a refusal.
    summary_fields: {},
  },
];

describe('<AddScheduleButton />', () => {
  beforeEach(() => {
    vi.mocked(UnifiedJobTemplatesAPI.read).mockResolvedValue({
      data: { count: resources.length, results: resources },
    } as unknown as ResponseOf<typeof UnifiedJobTemplatesAPI.read>);
    vi.mocked(JobTemplatesAPI.readLaunch).mockResolvedValue({
      data: { survey_enabled: false },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readLaunch>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const open = async (user: { click: (el: Element) => Promise<void> }) => {
    await user.click(screen.getByRole('button', { name: 'Add' }));
    return screen.findByText('a job template');
  };

  const pick = async (
    user: { click: (el: Element) => Promise<void> },
    name: string
  ) => {
    const row = (await screen.findByText(name)).closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('radio'));
  };

  /* A schedule belongs to the thing it starts, so that is asked first. */
  test('should ask what the schedule is for', async () => {
    const { user } = renderWithContexts(<AddScheduleButton />);

    await open(user);

    expect(screen.getByText('Job Template')).toBeInTheDocument();
    expect(screen.getByText('Cleanup Job')).toBeInTheDocument();
    // Nothing picked is nothing to schedule.
    expect(screen.getByTestId('can-go-on')).toHaveTextContent('false');
  });

  test('should build the form for what was picked', async () => {
    const { user } = renderWithContexts(<AddScheduleButton />);
    await open(user);

    await pick(user, 'a job template');

    expect(await screen.findByTestId('resource')).toHaveTextContent(
      'form for a job template'
    );
    expect(screen.getByTestId('can-go-on')).toHaveTextContent('true');
    // What the template prompts for is read before its form is built.
    await waitFor(() =>
      expect(JobTemplatesAPI.readLaunch).toHaveBeenCalledWith(7)
    );
  });

  /* A manual project has nothing to run on a schedule, and the api says so. */
  test('should refuse what the api says cannot be scheduled', async () => {
    const { user } = renderWithContexts(<AddScheduleButton />);
    await open(user);

    await pick(user, 'a manual project');

    expect(await screen.findByText(/cannot be scheduled/)).toBeInTheDocument();
    expect(screen.getByTestId('can-go-on')).toHaveTextContent('false');
  });

  /* The api reports no capability at all for a cleanup job, and its own
     screen schedules it like anything else: silence is not a refusal. */
  test('should allow what the api says nothing about', async () => {
    const { user } = renderWithContexts(<AddScheduleButton />);
    await open(user);

    await pick(user, 'Cleanup Job Details');

    expect(screen.queryByText(/cannot be scheduled/)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('can-go-on')).toHaveTextContent('true')
    );
  });

  /* Only the cleanup jobs that keep some history ask how much of it. */
  test('should ask for days only where the cleanup job keeps history', async () => {
    const cleanups = [
      {
        id: 3,
        name: 'Cleanup Job Details',
        type: 'system_job_template',
        job_type: 'cleanup_jobs',
        summary_fields: {},
      },
      {
        id: 4,
        name: 'Cleanup Expired Sessions',
        type: 'system_job_template',
        job_type: 'cleanup_sessions',
        summary_fields: {},
      },
    ];
    vi.mocked(UnifiedJobTemplatesAPI.read).mockResolvedValue({
      data: { count: cleanups.length, results: cleanups },
    } as unknown as ResponseOf<typeof UnifiedJobTemplatesAPI.read>);
    const { user } = renderWithContexts(<AddScheduleButton />);
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await pick(user, 'Cleanup Expired Sessions');
    await waitFor(() =>
      expect(screen.getByTestId('resource')).toHaveTextContent(
        'form for Cleanup Expired Sessions'
      )
    );
    expect(screen.getByTestId('asks-days')).toHaveTextContent('false');

    await pick(user, 'Cleanup Job Details');
    await waitFor(() =>
      expect(screen.getByTestId('resource')).toHaveTextContent(
        'form for Cleanup Job Details'
      )
    );
    expect(screen.getByTestId('asks-days')).toHaveTextContent('true');
  });

  /*
   * Picking one template and then another starts two reads, and the first
   * can answer last. Its prompts are for the template given up, so the form
   * stays the second one's rather than going back to loading for good.
   */
  test('should keep the prompts of the template picked last', async () => {
    const templates = [
      { ...resources[0], id: 7, name: 'first template' },
      { ...resources[0], id: 8, name: 'second template' },
    ];
    vi.mocked(UnifiedJobTemplatesAPI.read).mockResolvedValue({
      data: { count: templates.length, results: templates },
    } as unknown as ResponseOf<typeof UnifiedJobTemplatesAPI.read>);
    const answer: Record<number, () => void> = {};
    vi.mocked(JobTemplatesAPI.readLaunch).mockImplementation(
      (id) =>
        new Promise((resolve) => {
          answer[id as number] = () =>
            resolve({
              data: { survey_enabled: false, for: `template ${id}` },
            } as unknown as ResponseOf<typeof JobTemplatesAPI.readLaunch>);
        })
    );
    const { user } = renderWithContexts(<AddScheduleButton />);
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await pick(user, 'first template');
    // Its prompts are still being read: back to the list, and another.
    await user.click(await screen.findByRole('button', { name: 'Back' }));
    await pick(user, 'second template');
    await waitFor(() =>
      expect(JobTemplatesAPI.readLaunch).toHaveBeenCalledWith(8)
    );
    await act(async () => {
      answer[8]?.();
    });
    expect(await screen.findByTestId('prompts-for')).toHaveTextContent(
      'template 8'
    );
    await act(async () => {
      answer[7]?.();
    });

    expect(screen.getByTestId('resource')).toHaveTextContent(
      'form for second template'
    );
    expect(screen.getByTestId('prompts-for')).toHaveTextContent('template 8');
  });

  /*
   * The picker and the prompt steps page through the address, and what they
   * wrote outlives the modal: closing it forgets theirs, and only theirs.
   */
  test('should forget what its lists were showing when it closes', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/schedules?schedule.page=2&launch-inventory.page=3'],
    });
    const { user } = renderWithContexts(<AddScheduleButton />, {
      context: { router: { history } },
    });
    await open(user);
    await user.type(screen.getByRole('searchbox'), 'zzz{Enter}');
    await waitFor(() =>
      expect(history.location.search).toContain('schedule-for.')
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(history.location.search).toEqual('?schedule.page=2')
    );
    expect(history.location.pathname).toEqual('/schedules');
  });
});
