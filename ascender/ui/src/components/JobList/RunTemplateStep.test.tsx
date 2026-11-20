import type { AnyUnifiedJobTemplate } from 'types/api';
import React from 'react';
import { screen, waitFor, within, fireEvent } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { JobTemplatesAPI, WorkflowJobTemplatesAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import RunTemplateStep from './RunTemplateStep';

vi.mock('../../api/models/JobTemplates');
vi.mock('../../api/models/WorkflowJobTemplates');

const templates = [
  {
    id: 1,
    name: 'A job template',
    type: 'job_template',
    // Its own inventory, since nothing at launch can point it elsewhere.
    ask_inventory_on_launch: false,
    summary_fields: { inventory: { id: 9, name: 'the template inventory' } },
  },
  {
    id: 2,
    name: 'Another job template',
    type: 'job_template',
    ask_inventory_on_launch: true,
    summary_fields: { inventory: { id: 9, name: 'the template inventory' } },
  },
];

function mockList() {
  /* Each kind of template has an endpoint of its own, and the step reads the
     one its kind names. */
  vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
    data: { count: templates.length, results: templates },
  } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
  vi.mocked(WorkflowJobTemplatesAPI.read).mockResolvedValue({
    data: { count: 0, results: [] },
  } as unknown as ResponseOf<typeof WorkflowJobTemplatesAPI.read>);
  const options = {
    data: { actions: { GET: {} }, related_search_fields: [] },
  } as unknown as ResponseOf<typeof JobTemplatesAPI.readOptions>;
  vi.mocked(JobTemplatesAPI.readOptions).mockResolvedValue(options);
  vi.mocked(WorkflowJobTemplatesAPI.readOptions).mockResolvedValue(
    options as unknown as ResponseOf<typeof WorkflowJobTemplatesAPI.readOptions>
  );
}

async function renderStep(
  template: AnyUnifiedJobTemplate | null = null,
  mustAcceptLimit = false,
  templateType?: string,
  aimedAtInventoryIds?: number[],
  search?: string
) {
  const onSelect = vi.fn();
  const utils = renderWithContexts(
    <RunTemplateStep
      template={template}
      onSelect={onSelect}
      mustAcceptLimit={mustAcceptLimit}
      templateType={templateType}
      aimedAtInventoryIds={aimedAtInventoryIds}
    />,
    search
      ? {
          context: {
            router: {
              history: createMemoryHistory({ initialEntries: [search] }),
            },
          },
        }
      : undefined
  );
  await waitFor(() =>
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  );
  return { ...utils, onSelect };
}

/** What the step asked the api for, which is where its rules live. */
const asked = () => vi.mocked(JobTemplatesAPI.read).mock.calls[0]?.[0];

describe('<RunTemplateStep />', () => {
  beforeEach(() => {
    mockList();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should list what can be launched', async () => {
    await renderStep();

    expect(screen.getByText('A job template')).toBeInTheDocument();
    expect(screen.getByText('Another job template')).toBeInTheDocument();
  });

  /* A workflow is the other kind, and its own endpoint answers for it. */
  test('should ask the endpoint of the kind it was told to list', async () => {
    await renderStep(null, false, 'workflow_job_template');

    expect(WorkflowJobTemplatesAPI.read).toHaveBeenCalled();
    expect(JobTemplatesAPI.read).not.toHaveBeenCalled();
  });

  /*
   * A template the account cannot start is not an option, it is a dead end
   * two steps later, so the api is asked for the ones it can.
   */
  test('should ask only for templates this account may start', async () => {
    await renderStep();

    expect(asked()).toHaveProperty('role_level', 'execute_role');
  });

  /*
   * The api takes a limit only from a template configured to prompt for one,
   * so a run aimed at particular hosts is not offered the rest: they would
   * run on the whole inventory without saying so.
   */
  test('should offer only templates that take a limit when asked to', async () => {
    await renderStep(null, true);

    expect(asked()).toHaveProperty('ask_limit_on_launch', 'true');
  });

  test('should offer every template otherwise', async () => {
    await renderStep();

    expect(asked()).not.toHaveProperty('ask_limit_on_launch');
  });

  /*
   * The api takes an inventory at launch only from a template that prompts
   * for one, so one stuck with another inventory could not be run on what was
   * ticked: the list leaves it out rather than offering a dead end. A
   * template with no inventory of its own is stuck with nothing.
   */
  test('should ask only for templates the run can reach', async () => {
    await renderStep(null, false, 'job_template', [3]);

    expect(asked()).toMatchObject({
      or__inventory: '3',
      or__ask_inventory_on_launch: 'true',
      or__inventory__isnull: 'true',
    });
  });

  /* Several inventories are several runs, and only a template that asks for
     one can be pointed at each of them. */
  test('should leave the inventory out where the run spans several', async () => {
    await renderStep(null, false, 'job_template', [3, 4]);

    expect(asked()).not.toHaveProperty('or__inventory');
    expect(asked()).toHaveProperty('or__ask_inventory_on_launch', 'true');
  });

  test('should ask for every template where nothing names an inventory', async () => {
    await renderStep();

    expect(asked()).not.toHaveProperty('or__ask_inventory_on_launch');
  });

  /*
   * The api takes an inventory at launch only from a template that prompts
   * for one, so the rest run in their own whatever the run is aimed at, and
   * the row says which that is.
   */
  test('should name the inventory a template is stuck with', async () => {
    await renderStep();

    const row = screen.getByText('A job template').closest('tr') as HTMLElement;
    expect(within(row).getByText('the template inventory')).toBeInTheDocument();
  });

  test('should leave it blank where the template prompts for one', async () => {
    await renderStep();

    const row = screen
      .getByText('Another job template')
      .closest('tr') as HTMLElement;
    expect(
      within(row).queryByText('the template inventory')
    ).not.toBeInTheDocument();
  });

  /* The wizard's title says which kind this is, so no column repeats it. */
  test('should carry no type column', async () => {
    await renderStep();

    expect(
      screen.queryByRole('columnheader', { name: 'Type' })
    ).not.toBeInTheDocument();
  });

  /*
   * An empty list is a rule rather than an empty installation, so it says
   * which rule instead of asking for templates to be added.
   */
  describe('with nothing to list', () => {
    beforeEach(() => {
      vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
        data: { count: 0, results: [] },
      } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
    });

    test('should name the templates it found none of', async () => {
      await renderStep();

      expect(screen.getByText('No Templates Found')).toBeInTheDocument();
    });

    test('should blame the limit and the inventory where both apply', async () => {
      await renderStep(null, true, 'job_template', [3]);

      expect(
        screen.getByText('No template prompts for a limit in this inventory')
      ).toBeInTheDocument();
    });

    /* A run on the whole of an inventory passes no limit, so a template
       needs none: the inventory is all that is left to blame. */
    test('should blame the inventory alone where no limit is passed', async () => {
      await renderStep(null, false, 'job_template', [3]);

      expect(
        screen.getByText('No template can run in this inventory')
      ).toBeInTheDocument();
    });

    test('should blame the search where one is in place', async () => {
      await renderStep(
        null,
        true,
        'job_template',
        [3],
        '?run-template.name__icontains=zzz'
      );

      expect(
        screen.getByText('Nothing matches that search')
      ).toBeInTheDocument();
    });

    test('should say so plainly where no rule narrowed the list', async () => {
      await renderStep();

      expect(
        screen.getByText('There are no templates this account may start')
      ).toBeInTheDocument();
    });
  });

  /*
   * A template that is missing is one somebody will search for, so the rules
   * that leave it out sit beside the search.
   */
  /*
   * Only where the list is the narrowed one. A wizard that asks for the
   * template first leaves nothing out here, and the step that does the
   * leaving out carries the rule instead.
   */
  test('should say which templates a run is offered', async () => {
    const { user } = await renderStep(null, true);

    await user.click(
      screen.getByRole('button', { name: 'Which templates are listed' })
    );

    expect(
      await screen.findByText(/Limit field has Prompt on launch ticked/)
    ).toBeInTheDocument();
  });

  test('should say nothing about a list that leaves nothing out', async () => {
    await renderStep();

    expect(
      screen.queryByRole('button', { name: 'Which templates are listed' })
    ).not.toBeInTheDocument();
  });

  test('should report the template a row picks', async () => {
    const { onSelect } = await renderStep();

    const row = screen.getByText('A job template').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('radio'));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, name: 'A job template' })
    );
  });
});
