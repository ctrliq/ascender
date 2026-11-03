import React from 'react';
import {
  act,
  screen,
  waitFor,
  within,
  fireEvent,
} from '@testing-library/react';
import {
  GroupsAPI,
  HostsAPI,
  InventoriesAPI,
  JobTemplatesAPI,
  WorkflowJobTemplatesAPI,
} from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { mockInherited } from '../../../testUtils/apiMocks';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import RunTemplateWizard from './RunTemplateWizard';

vi.mock('../../api/models/Inventories');
vi.mock('../../api/models/JobTemplates');
vi.mock('../../api/models/WorkflowJobTemplates');
vi.mock('../../api/models/Hosts');
vi.mock('../../api/models/Groups');

const template = {
  id: 7,
  name: 'A job template',
  type: 'job_template',
  extra_vars: '',
  inventory: 4,
  summary_fields: { inventory: { id: 4, name: 'the template inventory' } },
};

/** A template that prompts for its variables and nothing else. */
const launchConfig = {
  can_start_without_user_input: false,
  ask_variables_on_launch: true,
  survey_enabled: false,
  passwords_needed_to_start: [],
  variables_needed_to_start: [],
  defaults: {},
};

function mockTemplates() {
  /* The preview names the inventory a caller passed by id, in words. */
  vi.mocked(InventoriesAPI.readDetail).mockResolvedValue({
    data: { id: 9, name: 'the inventory picked' },
  } as unknown as ResponseOf<typeof InventoriesAPI.readDetail>);
  /* Both models inherit read from Base, so this answers for either kind. */
  vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
    data: { count: 1, results: [template] },
  } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
  const options = {
    data: { actions: { GET: {} }, related_search_fields: [] },
  } as unknown as ResponseOf<typeof JobTemplatesAPI.readOptions>;
  vi.mocked(JobTemplatesAPI.readOptions).mockResolvedValue(options);
  vi.mocked(WorkflowJobTemplatesAPI.readOptions).mockResolvedValue(
    options as unknown as ResponseOf<typeof WorkflowJobTemplatesAPI.readOptions>
  );
  vi.mocked(JobTemplatesAPI.readLaunch).mockResolvedValue({
    data: launchConfig,
  } as unknown as ResponseOf<typeof JobTemplatesAPI.readLaunch>);
}

async function renderWizard() {
  const onClose = vi.fn();
  const utils = renderWithContexts(<RunTemplateWizard onClose={onClose} />);
  await waitFor(() =>
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  );
  return { ...utils, onClose };
}

/** The step the wizard is showing, as its nav marks it. */
function currentStep() {
  return document
    .querySelector('.pf-v6-c-wizard__nav-link.pf-m-current')
    ?.textContent?.trim();
}

/** The steps between a picked template and the button that starts the run. */
async function walkToLaunch() {
  await waitFor(() => expect(currentStep()).toEqual('Other Prompts'));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Launch' })).toBeInTheDocument()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
}

async function pickTheTemplate() {
  const row = await screen.findByText('A job template');
  fireEvent.click(within(row.closest('tr') as HTMLElement).getByRole('radio'));
  await waitFor(() =>
    expect(JobTemplatesAPI.readLaunch).toHaveBeenCalledWith(7)
  );
}

describe('<RunTemplateWizard />', () => {
  beforeEach(() => {
    mockTemplates();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should open on the template step with nothing to go on to', async () => {
    await renderWizard();

    expect(screen.getByText('Run Template')).toBeInTheDocument();
    expect(currentStep()).toEqual('Template');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  /*
   * The steps after the first are the template's own prompts, which is the
   * same wizard a launch from the template's row would show.
   */
  test('should add the steps the chosen template asks for', async () => {
    await renderWizard();
    await pickTheTemplate();

    // Picked, the wizard moves on to the first step the template adds.
    await waitFor(() => expect(currentStep()).toEqual('Other Prompts'));
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  /*
   * Run from a host list, the wizard carries the hosts as the limit: the field
   * the template prompts with is seeded from it, and a template that does not
   * prompt for one says so rather than running somewhere unexpected.
   */
  test('should say what the run is limited to', async () => {
    renderWithContexts(
      <RunTemplateWizard onClose={vi.fn()} limit="web1,web2" />
    );

    expect(await screen.findByText('Limit: web1,web2')).toBeInTheDocument();
  });

  test('should keep saying what the run is limited to', async () => {
    renderWithContexts(<RunTemplateWizard onClose={vi.fn()} limit="web1" />);
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    await pickTheTemplate();

    // Picking a template does not change what the run is aimed at.
    await waitFor(() => expect(currentStep()).toEqual('Other Prompts'));
    expect(screen.getByText('Limit: web1')).toBeInTheDocument();
  });

  /*
   * A list with nothing ticked means the whole of it, which arrives as the
   * pattern the ad hoc command form uses for the same thing. The header says
   * so, and it rules nothing out: every template stays on offer, including
   * the ones that would ignore a limit.
   */
  test('should treat a limit of every host as no limit at all', async () => {
    renderWithContexts(<RunTemplateWizard onClose={vi.fn()} limit="all" />);
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );

    expect(screen.getByText('Limit: all')).toBeInTheDocument();
    expect(
      vi.mocked(JobTemplatesAPI.read).mock.calls[0]?.[0]
    ).not.toHaveProperty('ask_limit_on_launch');
  });

  test('should still seed the field with every host', async () => {
    vi.mocked(JobTemplatesAPI.readLaunch).mockResolvedValue({
      data: { ...launchConfig, ask_limit_on_launch: true },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readLaunch>);
    renderWithContexts(<RunTemplateWizard onClose={vi.fn()} limit="all" />);
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    await pickTheTemplate();

    await waitFor(() => expect(currentStep()).toEqual('Other Prompts'));
    expect(screen.getByRole('textbox', { name: /Limit/ })).toHaveValue('all');
  });

  test('should send the limit where the template asks for one', async () => {
    vi.mocked(JobTemplatesAPI.readLaunch).mockResolvedValue({
      data: { ...launchConfig, ask_limit_on_launch: true },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readLaunch>);
    vi.mocked(JobTemplatesAPI.launch).mockResolvedValue({
      data: { id: 43, type: 'job' },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.launch>);
    renderWithContexts(<RunTemplateWizard onClose={vi.fn()} limit="web1" />);
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    await pickTheTemplate();

    await waitFor(() => expect(currentStep()).toEqual('Other Prompts'));
    expect(screen.getByRole('textbox', { name: /Limit/ })).toHaveValue('web1');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Launch' })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));

    await waitFor(() =>
      expect(JobTemplatesAPI.launch).toHaveBeenCalledTimes(1)
    );
    expect(vi.mocked(JobTemplatesAPI.launch).mock.calls[0]?.[1]).toMatchObject({
      limit: 'web1',
    });
  });

  /*
   * The hosts are in one inventory and nowhere else, so a wizard told which
   * one does not offer the step that would point the run somewhere the limit
   * means nothing. The api still takes the inventory from the launch.
   */
  test('should not ask for an inventory when the caller named one', async () => {
    vi.mocked(JobTemplatesAPI.readLaunch).mockResolvedValue({
      data: { ...launchConfig, ask_inventory_on_launch: true },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readLaunch>);
    vi.mocked(JobTemplatesAPI.launch).mockResolvedValue({
      data: { id: 44, type: 'job' },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.launch>);
    renderWithContexts(
      <RunTemplateWizard onClose={vi.fn()} limit="web1" inventoryId={9} />
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    await pickTheTemplate();

    await waitFor(() => expect(currentStep()).toEqual('Other Prompts'));
    // The step, not the column of that name the template list carries.
    expect(
      screen.queryByRole('button', { name: 'Inventory' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Launch' })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));

    await waitFor(() =>
      expect(JobTemplatesAPI.launch).toHaveBeenCalledTimes(1)
    );
    expect(vi.mocked(JobTemplatesAPI.launch).mock.calls[0]?.[1]).toMatchObject({
      inventory_id: 9,
    });
  });

  /*
   * Several inventories are several runs of the same template, one in each,
   * and the list is the only place all of them are.
   */
  test('should run the template once in each inventory it was given', async () => {
    vi.mocked(JobTemplatesAPI.readLaunch).mockResolvedValue({
      data: { ...launchConfig, ask_inventory_on_launch: true },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readLaunch>);
    vi.mocked(JobTemplatesAPI.launch).mockResolvedValue({
      data: { id: 45, type: 'job' },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.launch>);
    const { history } = renderWithContexts(
      <RunTemplateWizard onClose={vi.fn()} inventoryIds={[3, 5]} />
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    await pickTheTemplate();
    await walkToLaunch();

    await waitFor(() =>
      expect(JobTemplatesAPI.launch).toHaveBeenCalledTimes(2)
    );
    expect(
      vi
        .mocked(JobTemplatesAPI.launch)
        .mock.calls.map(
          ([, body]) => (body as { inventory_id: number }).inventory_id
        )
    ).toEqual([3, 5]);
    await waitFor(() => expect(history.location.pathname).toEqual('/runs'));
  });

  /*
   * One inventory refusing does not stop the run in the others. The list is
   * where the ones that started are, and it is handed the refusal, with the
   * api's reason, to say once the wizard has gone.
   */
  test('should start what it can and hand over what it could not', async () => {
    vi.mocked(JobTemplatesAPI.readLaunch).mockResolvedValue({
      data: { ...launchConfig, ask_inventory_on_launch: true },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readLaunch>);
    vi.mocked(JobTemplatesAPI.launch).mockImplementation(async (_id, body) => {
      if ((body as { inventory_id: number }).inventory_id === 5) {
        throw Object.assign(new Error('refused'), {
          response: { status: 400, data: { detail: 'Inventory has no hosts' } },
        });
      }
      return { data: { id: 48, type: 'job' } } as unknown as ResponseOf<
        typeof JobTemplatesAPI.launch
      >;
    });
    const onClose = vi.fn();
    const { history } = renderWithContexts(
      <RunTemplateWizard onClose={onClose} inventoryIds={[3, 5]} />
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    await pickTheTemplate();
    await walkToLaunch();

    await waitFor(() => expect(history.location.pathname).toEqual('/runs'));
    expect(JobTemplatesAPI.launch).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalled();
    expect(history.location.state).toEqual({
      notStarted: [
        expect.objectContaining({
          name: '#5',
          error: expect.objectContaining({
            response: expect.objectContaining({
              data: { detail: 'Inventory has no hosts' },
            }),
          }),
        }),
      ],
    });
  });

  test('should name every refusal where nothing started', async () => {
    vi.mocked(JobTemplatesAPI.readLaunch).mockResolvedValue({
      data: { ...launchConfig, ask_inventory_on_launch: true },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readLaunch>);
    vi.mocked(JobTemplatesAPI.launch).mockRejectedValue(
      Object.assign(new Error('refused'), {
        response: { status: 400, data: { detail: 'Template is disabled' } },
      })
    );
    const onClose = vi.fn();
    renderWithContexts(
      <RunTemplateWizard onClose={onClose} inventoryIds={[3, 5]} />
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    await pickTheTemplate();
    await walkToLaunch();

    expect(await screen.findByText('Not started: #3, #5')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  /*
   * A template with an inventory of its own runs in that one, so ticking two
   * is one run rather than two copies of the same thing somewhere else.
   */
  test('should run a template with its own inventory once', async () => {
    vi.mocked(JobTemplatesAPI.launch).mockResolvedValue({
      data: { id: 46, type: 'job' },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.launch>);
    const { history } = renderWithContexts(
      <RunTemplateWizard onClose={vi.fn()} inventoryIds={[3, 5]} />
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    await pickTheTemplate();
    await walkToLaunch();

    await waitFor(() =>
      expect(JobTemplatesAPI.launch).toHaveBeenCalledTimes(1)
    );
    expect(
      vi.mocked(JobTemplatesAPI.launch).mock.calls[0]?.[1]
    ).not.toHaveProperty('inventory_id');
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/runs/playbook/46/output')
    );
  });

  test('should launch the template and open the run it started', async () => {
    vi.mocked(JobTemplatesAPI.launch).mockResolvedValue({
      data: { id: 42, type: 'job' },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.launch>);
    const { history, onClose } = await renderWizard();
    await pickTheTemplate();

    // The template picked, the one thing it prompts for, then the preview.
    await waitFor(() => expect(currentStep()).toEqual('Other Prompts'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Launch' })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));

    await waitFor(() =>
      expect(JobTemplatesAPI.launch).toHaveBeenCalledTimes(1)
    );
    expect(vi.mocked(JobTemplatesAPI.launch).mock.calls[0]?.[0]).toEqual(7);
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/runs/playbook/42/output')
    );
    expect(onClose).toHaveBeenCalled();
  });

  /*
   * Picking one template and then another starts two reads, and the first can
   * answer last. Its prompts are for the template given up, so they neither
   * replace the second one's nor end the wait for them.
   */
  describe('picking again before the prompts arrive', () => {
    const other = { ...template, id: 8, name: 'Another job template' };

    /** Answers each template's launch read when the test says so. */
    function deferLaunchReads() {
      const answer: Record<number, (config: object) => void> = {};
      vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
        data: { count: 2, results: [template, other] },
      } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
      vi.mocked(JobTemplatesAPI.readLaunch).mockImplementation(
        (id) =>
          new Promise((resolve) => {
            answer[id as number] = (config) =>
              resolve({ data: config } as unknown as ResponseOf<
                typeof JobTemplatesAPI.readLaunch
              >);
          })
      );
      return answer;
    }

    async function pick(name: string) {
      const row = await screen.findByText(name);
      fireEvent.click(
        within(row.closest('tr') as HTMLElement).getByRole('radio')
      );
    }

    test('should keep the prompts of the template picked last', async () => {
      const answer = deferLaunchReads();
      await renderWizard();
      await pick('A job template');
      await pick('Another job template');
      await waitFor(() =>
        expect(JobTemplatesAPI.readLaunch).toHaveBeenCalledWith(8)
      );

      await act(async () => {
        answer[8]?.(launchConfig);
      });
      await waitFor(() => expect(currentStep()).toEqual('Other Prompts'));
      // The first template prompts for an inventory; the second does not.
      await act(async () => {
        answer[7]?.({ ...launchConfig, ask_inventory_on_launch: true });
      });

      expect(currentStep()).toEqual('Other Prompts');
      expect(
        screen.queryByRole('button', { name: 'Inventory' })
      ).not.toBeInTheDocument();
    });

    test('should keep waiting when the template given up answers', async () => {
      const answer = deferLaunchReads();
      await renderWizard();
      await pick('A job template');
      await pick('Another job template');
      await waitFor(() =>
        expect(JobTemplatesAPI.readLaunch).toHaveBeenCalledWith(8)
      );

      await act(async () => {
        answer[7]?.(launchConfig);
      });

      expect(currentStep()).toEqual('Template');
      expect(screen.getByText('Content Loading')).toBeInTheDocument();
      expect(screen.queryByText('Other Prompts')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    });

    /*
     * The form is rebuilt once per pick, when the prompts arrive, not a first
     * time for the pick itself: until then the template list stays as it was,
     * with the pick ticked, rather than being torn down and read again.
     */
    test('should rebuild the wizard only when the prompts arrive', async () => {
      const answer = deferLaunchReads();
      await renderWizard();
      const reads = vi.mocked(JobTemplatesAPI.read).mock.calls.length;
      await pick('A job template');
      await waitFor(() =>
        expect(JobTemplatesAPI.readLaunch).toHaveBeenCalledWith(7)
      );

      expect(currentStep()).toEqual('Template');
      const row = screen.getByText('A job template').closest('tr');
      expect(within(row as HTMLElement).getByRole('radio')).toBeChecked();
      expect(vi.mocked(JobTemplatesAPI.read).mock.calls.length).toBe(reads);

      await act(async () => {
        answer[7]?.(launchConfig);
      });
      await waitFor(() => expect(currentStep()).toEqual('Other Prompts'));
    });
  });

  test('should report a template whose prompts cannot be read', async () => {
    vi.mocked(JobTemplatesAPI.readLaunch).mockRejectedValue(new Error());
    await renderWizard();
    await pickTheTemplate();

    expect(await screen.findByText('Error!')).toBeInTheDocument();
  });

  /*
   * Opened from the runs list, where nothing has said what the run is for:
   * the template is picked first, and what it prompts for is what decides
   * where it can then be aimed.
   */
  describe('asked for from the runs list', () => {
    /** The rows of the step after the template, per kind. */
    function mockTargets() {
      mockInherited(HostsAPI, 'read').mockResolvedValue({
        data: { count: 1, results: [{ id: 10, name: 'web1' }] },
      });
      mockInherited(GroupsAPI, 'read').mockResolvedValue({
        data: { count: 1, results: [{ id: 20, name: 'webservers' }] },
      });
      vi.mocked(InventoriesAPI.read).mockResolvedValue({
        data: { count: 1, results: [{ id: 9, name: 'an inventory' }] },
      } as unknown as ResponseOf<typeof InventoriesAPI.read>);
    }

    async function openOnTheTemplate(config: Record<string, unknown>) {
      vi.mocked(JobTemplatesAPI.readLaunch).mockResolvedValue({
        data: { ...launchConfig, ...config },
      } as unknown as ResponseOf<typeof JobTemplatesAPI.readLaunch>);
      mockTargets();
      renderWithContexts(
        <RunTemplateWizard
          onClose={vi.fn()}
          asksForTarget
          templateType="job_template"
        />
      );
      await waitFor(() =>
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
      );
      expect(currentStep()).toEqual('Template');
      await pickTheTemplate();
    }

    /* A limit and no inventory prompt: the run happens in the template's own
       inventory, so what it can be aimed at is that inventory's hosts. */
    test('should offer the hosts of the inventory the template keeps', async () => {
      await openOnTheTemplate({ ask_limit_on_launch: true });

      await waitFor(() => expect(currentStep()).toEqual('Limit'));
      // No inventory to pick: the template names its own.
      expect(
        screen.queryByRole('option', { name: 'Inventory' })
      ).not.toBeInTheDocument();
      expect(vi.mocked(GroupsAPI.read).mock.calls[0]?.[0]).toMatchObject({
        inventory: 4,
      });
      expect(await screen.findByText('webservers')).toBeInTheDocument();
      // Nothing ticked is the whole inventory, which is a run of its own.
      expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    });

    /* An inventory prompt and no limit: the run is aimed at whole
       inventories, one run in each, and nothing narrower. */
    test('should offer the inventories a template prompts for', async () => {
      await openOnTheTemplate({ ask_inventory_on_launch: true });

      await waitFor(() => expect(currentStep()).toEqual('Limit'));
      expect(await screen.findByText('an inventory')).toBeInTheDocument();
      expect(
        screen.queryByRole('option', { name: 'Hosts' })
      ).not.toBeInTheDocument();
      // An inventory is where the run happens, so one has to be picked.
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    });

    /*
     * A template that prompts for neither runs on its own inventory whole,
     * so there is nothing to ask and no step that asks it.
     */
    test('should not ask where a template runs when it cannot be aimed', async () => {
      await openOnTheTemplate({});

      // The step name in the nav, and the step itself, are both this text.
      await waitFor(() =>
        expect(screen.getAllByText('Other Prompts').length).toBeGreaterThan(0)
      );
      expect(
        screen.queryByRole('button', { name: 'Limit' })
      ).not.toBeInTheDocument();
    });

    /* What is ticked is the limit the template prompts with, so the field it
       asks in holds it and the launch sends it. */
    test('should take the hosts ticked as the limit', async () => {
      vi.mocked(JobTemplatesAPI.launch).mockResolvedValue({
        data: { id: 47, type: 'job' },
      } as unknown as ResponseOf<typeof JobTemplatesAPI.launch>);
      await openOnTheTemplate({ ask_limit_on_launch: true });
      await waitFor(() => expect(currentStep()).toEqual('Limit'));

      fireEvent.change(screen.getByRole('combobox', { name: 'Run On' }), {
        target: { value: 'host' },
      });
      const row = (await screen.findByText('web1')).closest(
        'tr'
      ) as HTMLElement;
      fireEvent.click(within(row).getByRole('checkbox'));

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(currentStep()).toEqual('Other Prompts'));
      expect(screen.getByRole('textbox', { name: /Limit/ })).toHaveValue(
        'web1'
      );

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Launch' })
        ).toBeInTheDocument()
      );
      fireEvent.click(screen.getByRole('button', { name: 'Launch' }));

      await waitFor(() =>
        expect(JobTemplatesAPI.launch).toHaveBeenCalledTimes(1)
      );
      expect(
        vi.mocked(JobTemplatesAPI.launch).mock.calls[0]?.[1]
      ).toMatchObject({ limit: 'web1' });
    });
  });
});
