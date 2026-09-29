import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import {
  InventoriesAPI,
  InventorySourcesAPI,
  ProjectsAPI,
  SystemJobTemplatesAPI,
  JobTemplatesAPI,
  WorkflowJobTemplatesAPI,
} from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import RunMenu from './RunMenu';

vi.mock('../../api');

const page = <T,>(results: T[]) =>
  ({
    data: { count: results.length, results },
  }) as unknown as ResponseOf<typeof ProjectsAPI.read>;

describe('<RunMenu />', () => {
  let history: TestHistory;

  beforeEach(() => {
    vi.mocked(ProjectsAPI.read).mockResolvedValue(
      page([{ id: 3, name: 'a project' }])
    );
    vi.mocked(InventorySourcesAPI.read).mockResolvedValue(
      page([{ id: 4, name: 'a source' }])
    );
    vi.mocked(SystemJobTemplatesAPI.read).mockResolvedValue(
      page([
        {
          id: 5,
          name: 'Cleanup Expired Sessions',
          job_type: 'cleanup_sessions',
        },
        { id: 6, name: 'Cleanup Job Details', job_type: 'cleanup_jobs' },
      ])
    );
    vi.mocked(JobTemplatesAPI.read).mockResolvedValue(
      page([{ id: 7, name: 'a template', type: 'job_template' }])
    );
    vi.mocked(WorkflowJobTemplatesAPI.read).mockResolvedValue(
      page([]) as unknown as ResponseOf<typeof WorkflowJobTemplatesAPI.read>
    );
    /* What the template prompts for, which is what says where it can be
       aimed: this one takes an inventory, so the step after it lists them. */
    vi.mocked(JobTemplatesAPI.readLaunch).mockResolvedValue({
      data: {
        ask_inventory_on_launch: true,
        ask_variables_on_launch: true,
        survey_enabled: false,
        defaults: {},
      },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readLaunch>);
    vi.mocked(InventoriesAPI.read).mockResolvedValue(
      page([{ id: 2, name: 'an inventory' }])
    );
    const options = {
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readOptions>;
    vi.mocked(JobTemplatesAPI.readOptions).mockResolvedValue(options);
    vi.mocked(WorkflowJobTemplatesAPI.readOptions).mockResolvedValue(
      options as unknown as ResponseOf<
        typeof WorkflowJobTemplatesAPI.readOptions
      >
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderMenu() {
    history = createMemoryHistory({ initialEntries: ['/runs'] });
    return renderWithContexts(<RunMenu />, {
      context: { router: { history } },
    });
  }

  const open = async (
    user: { click: (el: Element) => Promise<void> },
    item: string
  ) => {
    await user.click(screen.getByRole('button', { name: 'Run' }));
    await user.click(screen.getByRole('menuitem', { name: item }));
  };

  /** The wizard's first step, answered with the one template there is. */
  const pickTemplate = async (user: {
    click: (el: Element) => Promise<void>;
  }) => {
    // One template to a run, so the template list ticks are radios.
    const row = (await screen.findByText('a template')).closest(
      'tr'
    ) as HTMLElement;
    await user.click(within(row).getByRole('radio'));
    await waitFor(() =>
      expect(JobTemplatesAPI.readLaunch).toHaveBeenCalledWith(7)
    );
  };

  test('should offer a run of each kind the list shows', async () => {
    const { user } = renderMenu();

    await user.click(screen.getByRole('button', { name: 'Run' }));

    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent)
    ).toEqual([
      'Job',
      'Workflow',
      'Command',
      'Inventory Sync',
      'Project Sync',
      'Cleanup Job',
    ]);
  });

  /* A job and a workflow are two things to run, so each asks for its own. */
  test('should offer one kind of template at a time', async () => {
    const { user } = renderMenu();

    await open(user, 'Workflow');
    expect(screen.getByText('Run Workflow')).toBeInTheDocument();

    // The kind asked for is the endpoint asked, one per kind.
    await waitFor(() =>
      expect(WorkflowJobTemplatesAPI.read).toHaveBeenCalled()
    );
    expect(JobTemplatesAPI.read).not.toHaveBeenCalled();
  });

  /*
   * The template is the wizard's first step, and where to run it the second:
   * what a template prompts for is what says where it can be aimed at all.
   */
  test('should take the template before what to run it on', async () => {
    vi.mocked(InventoriesAPI.read).mockResolvedValue(
      page([
        { id: 2, name: 'first inventory' },
        { id: 3, name: 'second inventory' },
      ])
    );
    const { user } = renderMenu();

    await open(user, 'Job');

    expect(screen.getByText('Run Job')).toBeInTheDocument();
    // Nothing picked is nothing to run, so there is nothing to go on to.
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(
      screen
        .getAllByRole('button', { name: /Limit|Template/ })
        .map((step) => step.textContent)
    ).toEqual(['Template']);

    await pickTemplate(user);

    // The step it asks for arrives with it, and the wizard opens on it.
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('button', { name: /Limit|Template/ })
          .map((step) => step.textContent)
      ).toEqual(['Template', 'Limit'])
    );
    expect(await screen.findByText('first inventory')).toBeInTheDocument();
    expect(screen.getByText('second inventory')).toBeInTheDocument();
  });

  /*
   * A list inside the wizard writes its search into the address, and nothing
   * on the screen behind says so: closing the wizard forgets it, or the next
   * one opens filtered by something invisible.
   */
  test('should forget what its lists were showing when it closes', async () => {
    const { user } = renderMenu();

    await open(user, 'Job');
    await screen.findByRole('searchbox');
    await user.type(screen.getByRole('searchbox'), 'zzz{Enter}');
    await waitFor(() =>
      expect(history.location.search).toContain('run-template.')
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(history.location.search).toEqual(''));
  });

  test('should update the project it is given', async () => {
    vi.mocked(ProjectsAPI.sync).mockResolvedValue({
      data: { id: 77 },
    } as unknown as ResponseOf<typeof ProjectsAPI.sync>);
    const { user } = renderMenu();

    await open(user, 'Project Sync');
    await user.click(
      within(
        (await screen.findByText('a project')).closest('tr') as HTMLElement
      ).getByRole('checkbox')
    );
    await user.click(screen.getByRole('button', { name: 'Launch' }));

    await waitFor(() => expect(ProjectsAPI.sync).toHaveBeenCalledWith(3));
    expect(history.location.pathname).toEqual('/runs/project/77/output');
  });

  test('should sync the inventory source it is given', async () => {
    vi.mocked(InventorySourcesAPI.createSyncStart).mockResolvedValue({
      data: { id: 88 },
    } as unknown as ResponseOf<typeof InventorySourcesAPI.createSyncStart>);
    const { user } = renderMenu();

    await open(user, 'Inventory Sync');
    await user.click(
      within(
        (await screen.findByText('a source')).closest('tr') as HTMLElement
      ).getByRole('checkbox')
    );
    await user.click(screen.getByRole('button', { name: 'Launch' }));

    await waitFor(() =>
      expect(InventorySourcesAPI.createSyncStart).toHaveBeenCalledWith(4)
    );
    expect(history.location.pathname).toEqual('/runs/inventory/88/output');
  });

  /*
   * These are the runs somebody starts several of, and several runs have no
   * one output page: the list is where they all are.
   */
  test('should start every cleanup job ticked, and go to the list', async () => {
    vi.mocked(SystemJobTemplatesAPI.read).mockResolvedValue(
      page([
        {
          id: 5,
          name: 'Cleanup Expired Sessions',
          job_type: 'cleanup_sessions',
        },
        { id: 7, name: 'Cleanup Expired Tokens', job_type: 'cleanup_tokens' },
      ])
    );
    vi.mocked(SystemJobTemplatesAPI.launch).mockResolvedValue({
      data: { id: 101 },
    } as unknown as ResponseOf<typeof SystemJobTemplatesAPI.launch>);
    const { user } = renderMenu();

    await open(user, 'Cleanup Job');
    await user.click(
      within(
        (await screen.findByText('Cleanup Expired Sessions')).closest(
          'tr'
        ) as HTMLElement
      ).getByRole('checkbox')
    );
    await user.click(
      within(
        (await screen.findByText('Cleanup Expired Tokens')).closest(
          'tr'
        ) as HTMLElement
      ).getByRole('checkbox')
    );
    await user.click(screen.getByRole('button', { name: 'Launch' }));

    await waitFor(() =>
      expect(SystemJobTemplatesAPI.launch).toHaveBeenCalledTimes(2)
    );
    expect(history.location.pathname).toEqual('/runs');
  });

  /*
   * Some started and some did not. Starting any closes the picker on the way to
   * the runs list, and the picker was what named the refusals, so they went
   * with it and the list looked as though everything had started.
   */
  test('should name what did not start after moving to the runs', async () => {
    vi.mocked(SystemJobTemplatesAPI.read).mockResolvedValue(
      page([
        {
          id: 5,
          name: 'Cleanup Expired Sessions',
          job_type: 'cleanup_sessions',
        },
        { id: 7, name: 'Cleanup Expired Tokens', job_type: 'cleanup_tokens' },
      ])
    );
    vi.mocked(SystemJobTemplatesAPI.launch).mockImplementation(async (id) => {
      if (id === 7) {
        throw Object.assign(new Error('refused'), {
          response: {
            status: 400,
            data: { detail: 'Tokens are cleaned up by another job' },
          },
        });
      }
      return { data: { id: 101 } } as unknown as ResponseOf<
        typeof SystemJobTemplatesAPI.launch
      >;
    });
    const { user } = renderMenu();

    await open(user, 'Cleanup Job');
    await user.click(
      within(
        (await screen.findByText('Cleanup Expired Sessions')).closest(
          'tr'
        ) as HTMLElement
      ).getByRole('checkbox')
    );
    await user.click(
      within(
        (await screen.findByText('Cleanup Expired Tokens')).closest(
          'tr'
        ) as HTMLElement
      ).getByRole('checkbox')
    );
    await user.click(screen.getByRole('button', { name: 'Launch' }));

    await waitFor(() => expect(history.location.pathname).toEqual('/runs'));
    expect(
      await screen.findByText('Not started: Cleanup Expired Tokens')
    ).toBeInTheDocument();
    // And why, which the names alone do not say.
    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(
      screen.getByText('Tokens are cleaned up by another job')
    ).toBeInTheDocument();
  });

  /*
   * A wizard opened from a host list goes to the runs list when some of its
   * runs were refused, and is gone by then: it hands the refusals over in the
   * navigation state, which the menu says once and then forgets.
   */
  test('should name what a launch elsewhere handed over', async () => {
    history = createMemoryHistory({
      initialEntries: [
        {
          pathname: '/runs',
          state: {
            notStarted: [
              {
                name: 'db inventory',
                error: {
                  name: 'Error',
                  message: '',
                  response: { status: 400, data: { detail: 'No hosts' } },
                },
              },
            ],
          },
        },
      ],
    });
    const { user } = renderWithContexts(<RunMenu />, {
      context: { router: { history } },
    });

    expect(
      await screen.findByText('Not started: db inventory')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText('No hosts')).toBeInTheDocument();
    await waitFor(() => expect(history.location.state).toBeNull());
  });

  /* One question about one number, asked once for whichever were ticked. */
  test('should ask for the days once and send them to each job', async () => {
    vi.mocked(SystemJobTemplatesAPI.launch).mockResolvedValue({
      data: { id: 102 },
    } as unknown as ResponseOf<typeof SystemJobTemplatesAPI.launch>);
    const { user } = renderMenu();

    await open(user, 'Cleanup Job');
    await user.click(
      within(
        (await screen.findByText('Cleanup Job Details')).closest(
          'tr'
        ) as HTMLElement
      ).getByRole('checkbox')
    );
    await user.click(
      within(
        (await screen.findByText('Cleanup Expired Sessions')).closest(
          'tr'
        ) as HTMLElement
      ).getByRole('checkbox')
    );
    await user.click(screen.getByRole('button', { name: 'Launch' }));

    expect(
      await screen.findByText('Set how many days of data should be retained.')
    ).toBeInTheDocument();
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Run' })
    );

    await waitFor(() =>
      expect(SystemJobTemplatesAPI.launch).toHaveBeenCalledTimes(2)
    );
    // The number goes to the one that keeps history, and to no other.
    expect(SystemJobTemplatesAPI.launch).toHaveBeenCalledWith(6, {
      extra_vars: { days: 30 },
    });
    expect(SystemJobTemplatesAPI.launch).toHaveBeenCalledWith(5, {});
  });

  test('should start a management job that asks for nothing', async () => {
    vi.mocked(SystemJobTemplatesAPI.launch).mockResolvedValue({
      data: { id: 99 },
    } as unknown as ResponseOf<typeof SystemJobTemplatesAPI.launch>);
    const { user } = renderMenu();

    await open(user, 'Cleanup Job');
    await user.click(
      within(
        (await screen.findByText('Cleanup Expired Sessions')).closest(
          'tr'
        ) as HTMLElement
      ).getByRole('checkbox')
    );
    await user.click(screen.getByRole('button', { name: 'Launch' }));

    await waitFor(() =>
      expect(SystemJobTemplatesAPI.launch).toHaveBeenCalledWith(5, {})
    );
    expect(history.location.pathname).toEqual('/runs/management/99/output');
  });

  /* The two that keep a number of days of records ask for it first. */
  test('should ask how much history a cleanup job keeps', async () => {
    vi.mocked(SystemJobTemplatesAPI.launch).mockResolvedValue({
      data: { id: 100 },
    } as unknown as ResponseOf<typeof SystemJobTemplatesAPI.launch>);
    const { user } = renderMenu();

    await open(user, 'Cleanup Job');
    await user.click(
      within(
        (await screen.findByText('Cleanup Job Details')).closest(
          'tr'
        ) as HTMLElement
      ).getByRole('checkbox')
    );
    await user.click(screen.getByRole('button', { name: 'Launch' }));

    expect(
      await screen.findByText('Set how many days of data should be retained.')
    ).toBeInTheDocument();
    expect(SystemJobTemplatesAPI.launch).not.toHaveBeenCalled();

    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Run' })
    );

    await waitFor(() =>
      expect(SystemJobTemplatesAPI.launch).toHaveBeenCalledWith(6, {
        extra_vars: { days: 30 },
      })
    );
  });
});
