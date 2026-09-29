import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryHistory } from 'history';
import type { ApiResponse } from 'api/Base';
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';

import { LabelsAPI, UnifiedJobTemplatesAPI, UsersAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import LabelLists from './LabelLists';

const stylesheet = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'LabelLists.css'),
  'utf8'
);

/**
 * What a rule in the stylesheet declares for a property.
 *
 * Args:
 *     selector: The selector to read, as it is written in the file.
 *     property: The property to read out of that rule.
 *
 * Returns:
 *     The declared value, or null when the rule or the property is not there.
 */
function declared(selector: string, property: string): string | null {
  const rule = stylesheet
    .split('}')
    .find((block) => block.split('{')[0]?.includes(selector));
  const match = rule?.match(new RegExp(`${property}:\\s*([^;]+);`));
  return match ? (match[1] as string).trim() : null;
}

vi.mock('../../api/models/Labels');
vi.mock('../../api/models/UnifiedJobTemplates');
vi.mock('../../api/models/Users');

// Labels carry no user_capabilities, which is the whole reason the delete
// button needed its own rule: the fixture keeps that shape rather than the
// fuller one other resources send.
const labels = {
  data: {
    count: 2,
    results: [
      {
        id: 1,
        name: 'production',
        url: '',
        summary_fields: { organization: { id: 1, name: 'Default' } },
      },
      {
        id: 2,
        name: 'spare',
        url: '',
        summary_fields: { organization: { id: 1, name: 'Default' } },
      },
    ],
  },
} as unknown as ResponseOf<typeof LabelsAPI.read>;

/**
 * How many templates of each kind carry each label, as the api counts them.
 *
 * Two job templates and one workflow template of its own organization carry
 * the first label, so the two columns cannot be read off each other or off a
 * single total, and the second label is on nothing.
 */
const templateCounts: Record<number, Record<string, number>> = {
  1: { job_template: 2, workflow_job_template: 1 },
};

/**
 * Answers a count request the way the api does: the total in count, and at
 * most the one row asked for.
 *
 * Args:
 *     params: What the list asked the api for.
 *
 * Returns:
 *     A page whose count is the templates of that kind carrying that label.
 */
function countTemplates(params: Record<string, unknown>) {
  const count =
    templateCounts[Number(params.labels__id)]?.[String(params.type)] ?? 0;
  return Promise.resolve({ data: { count, next: null, results: [] } });
}

describe('<LabelLists />', () => {
  beforeEach(() => {
    (LabelsAPI.read as unknown as ReturnType<typeof vi.fn>) = vi
      .fn()
      .mockResolvedValue(labels);
    (UnifiedJobTemplatesAPI.read as unknown as ReturnType<typeof vi.fn>) = vi
      .fn()
      .mockImplementation(countTemplates);
    (LabelsAPI.readOptions as unknown as ReturnType<typeof vi.fn>) = vi
      .fn()
      .mockResolvedValue({ data: { actions: { GET: {}, POST: {} } } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should list every label, not only the ones in use', async () => {
    renderWithContexts(<LabelLists />);
    await waitFor(() => expect(LabelsAPI.read).toHaveBeenCalled());
    expect(await screen.findByText('production')).toBeInTheDocument();
    expect(screen.getByText('spare')).toBeInTheDocument();

    // the filter that used to narrow this to attached labels is gone, so a
    // label belonging to nothing still shows
    const [params] = (LabelsAPI.read as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0] as [Record<string, unknown>];
    expect(params).not.toHaveProperty('unifiedjobtemplate_labels__search');
  });

  test('offers Add to someone the api lets create a label', async () => {
    renderWithContexts(<LabelLists />);
    await screen.findByText('production');
    expect(screen.getByRole('link', { name: 'Add' })).toBeInTheDocument();
  });

  test('offers no Add to someone the api does not let create a label', async () => {
    (LabelsAPI.readOptions as unknown as ReturnType<typeof vi.fn>) = vi
      .fn()
      .mockResolvedValue({ data: { actions: { GET: {} } } });
    renderWithContexts(<LabelLists />);
    await screen.findByText('production');
    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
  });

  test('should count each kind of template on its own, and dash the rest', async () => {
    const { container } = renderWithContexts(<LabelLists />);
    await waitFor(() => expect(UnifiedJobTemplatesAPI.read).toHaveBeenCalled());

    await waitFor(() => {
      const cells = [...container.querySelectorAll('tbody tr')].map((row) =>
        [...row.querySelectorAll('td')].map((cell) => cell.textContent?.trim())
      );
      // production carries two job templates and one workflow template
      expect(cells[0]?.[3]).toBe('2');
      expect(cells[0]?.[4]).toBe('1');
      // spare carries neither kind
      expect(cells[1]?.[3]).toBe('-');
      expect(cells[1]?.[4]).toBe('-');
    });
  });

  /*
   * A count is a claim about a set, so the link beside it has to show that set
   * and no more: by the label's id, because a label's name is only unique
   * within an organization, and by the kind the column counted.
   */
  test('should link each count to the templates it counted', async () => {
    const { container } = renderWithContexts(<LabelLists />);
    await waitFor(() => expect(UnifiedJobTemplatesAPI.read).toHaveBeenCalled());

    await waitFor(() => {
      const row = container.querySelector('tbody tr') as HTMLElement;
      const links = [...row.querySelectorAll('td a')].map((a) =>
        a.getAttribute('href')
      );
      expect(links).toContain(
        '/templates?template.labels__id=1&template.organization__id=1' +
          '&template.or__type=job_template'
      );
      expect(links).toContain(
        '/templates?template.labels__id=1&template.organization__id=1' +
          '&template.or__type=workflow_job_template'
      );
    });
  });

  test('should not link a count of none', async () => {
    const { container } = renderWithContexts(<LabelLists />);
    await waitFor(() => expect(UnifiedJobTemplatesAPI.read).toHaveBeenCalled());

    await waitFor(() => {
      const rows = [...container.querySelectorAll('tbody tr')];
      const spare = rows[1] as HTMLElement;
      const counts = [...spare.querySelectorAll('td')].slice(3, 5);
      counts.forEach((cell) => {
        expect(cell.textContent?.trim()).toBe('-');
        expect(cell.querySelector('a')).toBeNull();
      });
    });
  });

  test('should enable delete once a row is selected', async () => {
    const { user } = renderWithContexts(<LabelLists />);
    expect(await screen.findByText('production')).toBeInTheDocument();

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    expect(deleteButton).toBeDisabled();

    // a label has no user_capabilities, so without the component's own rule
    // this row would count as undeletable and the button would stay disabled
    await user.click(screen.getAllByRole('checkbox')[1] as HTMLElement);
    expect(deleteButton).toBeEnabled();
  });

  test('should say that only a label on nothing can be deleted', async () => {
    const { user } = renderWithContexts(<LabelLists />);
    expect(await screen.findByText('production')).toBeInTheDocument();

    // the message is shown for more than one, so both rows go
    await user.click(screen.getAllByRole('checkbox')[1] as HTMLElement);
    await user.click(screen.getAllByRole('checkbox')[2] as HTMLElement);
    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(
      await screen.findByText(/Only a label that nothing carries/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });

  test('should delete the selected labels', async () => {
    (LabelsAPI.destroy as unknown as ReturnType<typeof vi.fn>) = vi
      .fn()
      .mockResolvedValue({} as ApiResponse);
    const { user } = renderWithContexts(<LabelLists />);
    expect(await screen.findByText('production')).toBeInTheDocument();

    await user.click(screen.getAllByRole('checkbox')[1] as HTMLElement);
    await user.click(screen.getByRole('button', { name: /delete/i }));
    // the dialog holds a Cancel and a confirm, both matching /delete/i by
    // accessible name, so the confirm is picked by its own label
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() => expect(LabelsAPI.destroy).toHaveBeenCalledWith(1));
  });

  /*
   * The api refuses to delete a label that is still attached, with a 409 that
   * says what to do about it. That is shown as it stands, not behind Details,
   * and a refusal of one label does not keep the others from going.
   */
  test('should say why a label in use was not deleted', async () => {
    (LabelsAPI.destroy as unknown as ReturnType<typeof vi.fn>) = vi
      .fn()
      .mockImplementation(async (id: number) => {
        if (id === 1) {
          throw Object.assign(new Error('Conflict'), {
            response: {
              status: 409,
              config: { method: 'delete', url: '/api/v2/labels/1/' },
              data: {
                detail: 'This label is still attached. Detach it first.',
              },
            },
          });
        }
        return {} as ApiResponse;
      });
    const { user } = renderWithContexts(<LabelLists />);
    expect(await screen.findByText('production')).toBeInTheDocument();

    await user.click(screen.getAllByRole('checkbox')[1] as HTMLElement);
    await user.click(screen.getAllByRole('checkbox')[2] as HTMLElement);
    await user.click(screen.getByRole('button', { name: /delete/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'confirm delete' })
    );

    // In the body of the message, rather than only inside Details.
    expect(
      await screen.findByText(
        'This label is still attached. Detach it first.',
        { selector: 'p' }
      )
    ).toBeVisible();
    expect(LabelsAPI.destroy).toHaveBeenCalledWith(2);
  });

  /*
   * A count is asked of the api per label, so a template carrying more labels
   * than its summary lists still counts, and only for the labels on screen:
   * a page of one is one label counted, not every label the search matched.
   */
  test('should count only the labels on the page, each on its own', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/labels?labels.page_size=1'],
    });
    renderWithContexts(<LabelLists />, { context: { router: { history } } });
    expect(await screen.findByText('production')).toBeInTheDocument();
    await waitFor(() =>
      expect(UnifiedJobTemplatesAPI.read).toHaveBeenCalledTimes(2)
    );

    expect(UnifiedJobTemplatesAPI.read).toHaveBeenCalledWith({
      labels__id: 1,
      organization__id: 1,
      type: 'job_template',
      page_size: 1,
    });
    expect(UnifiedJobTemplatesAPI.read).toHaveBeenCalledWith({
      labels__id: 1,
      organization__id: 1,
      type: 'workflow_job_template',
      page_size: 1,
    });
    expect(screen.queryByText('spare')).not.toBeInTheDocument();
  });

  /*
   * The two count columns are tallied here rather than by the api, which has no
   * field to order labels by and answers 400 to the attempt. Ordering by them
   * is therefore this screen's to do, over every label the search matched
   * rather than over whichever page is on screen.
   */
  /**
   * Renders the list at one ordering and reads back the names in row order.
   *
   * Args:
   *     order: What to order by, as the query string carries it.
   *
   * Returns:
   *     The label names, in the order the table drew them.
   */
  async function namesOrderedBy(order: string) {
    const history = createMemoryHistory({
      initialEntries: [`/labels?labels.order_by=${order}`],
    });
    const { container } = renderWithContexts(<LabelLists />, {
      context: { router: { history } },
    });
    await waitFor(() => expect(UnifiedJobTemplatesAPI.read).toHaveBeenCalled());
    await screen.findByText('production');
    return [...container.querySelectorAll('tbody tr')].map((row) =>
      row.children[1]?.textContent?.trim()
    );
  }

  /*
   * The two count columns are tallied here rather than by the api, which has no
   * field to order labels by and answers 400 to the attempt. Ordering by them
   * is therefore this screen's to do, over every label the search matched
   * rather than over whichever page is on screen.
   */
  test('should order by a count, most carried first', async () => {
    // production carries two job templates, spare carries none
    expect(await namesOrderedBy('-job_templates')).toEqual([
      'production',
      'spare',
    ]);
  });

  test('should order by a count, least carried first', async () => {
    expect(await namesOrderedBy('job_templates')).toEqual([
      'spare',
      'production',
    ]);
  });

  /* The order is the counts, so every label the search matched is counted
     before a page is cut, not only the one on screen. */
  test('should count every label to order by a count', async () => {
    const history = createMemoryHistory({
      initialEntries: [
        '/labels?labels.order_by=-job_templates&labels.page_size=1',
      ],
    });
    renderWithContexts(<LabelLists />, { context: { router: { history } } });

    expect(await screen.findByText('production')).toBeInTheDocument();
    expect(UnifiedJobTemplatesAPI.read).toHaveBeenCalledWith(
      expect.objectContaining({ labels__id: 2 })
    );
  });

  /*
   * The widths are shares, not pixels: the table hands out what it has over by
   * the ratio between them. These are the ratios that grow all four gaps
   * between the headings at one rate, so a wider window widens them alike
   * rather than opening one of them out. Job Templates asks for as good as
   * nothing on purpose, so the gap before it is taken out of the column to its
   * left rather than its own, its heading being held to the right.
   */
  test('should share the table out so every heading is as far from the next', async () => {
    renderWithContexts(<LabelLists />);
    await waitFor(() => expect(screen.queryByText('production')).toBeTruthy());

    const widths = Object.fromEntries(
      screen
        .getAllByRole('columnheader')
        .map((th) => [th.textContent?.trim(), (th as HTMLElement).style.width])
    );
    expect(widths).toMatchObject({
      Name: '287px',
      Organization: '298px',
      'Job Templates': '1px',
      'Workflow Templates': '366px',
      Actions: '259px',
    });
  });

  /*
   * The shares alone leave a difference that is the same at every width, since
   * the columns grow together: Name's heading is the shortest in the table, and
   * the padding is what stands its column off by as much as the longer headings
   * stand off by themselves.
   */
  test('should stand the shortest heading off by as much as the longest', () => {
    expect(
      declared(
        '.pf-v6-c-table tr > .ascender-label-lists__name',
        'padding-inline-start'
      )
    ).toBe('46px');
  });

  /*
   * Every other list reads its actions from the left. This row ends in numbers
   * held to the right, and the actions follow them rather than starting a
   * column of their own out in the middle of the gap.
   *
   * jsdom loads no stylesheet and lays nothing out, so the file itself is what
   * a test here can hold on to.
   */
  test('should hold the actions to the right, under their heading', () => {
    expect(
      declared('.pf-v6-c-table__td.ascender-label-lists__actions', 'text-align')
    ).toBe('right');
    expect(
      declared(
        '.ascender-label-lists__actions .ascender-actions-td__grid',
        'justify-content'
      )
    ).toBe('flex-end');
  });

  test('should read every page of labels, not only the first', async () => {
    renderWithContexts(<LabelLists />);
    await waitFor(() => expect(LabelsAPI.read).toHaveBeenCalled());

    // Sorting here only means anything over the whole set, so the whole set is
    // what it reads: a page of its own choosing rather than the table's.
    await waitFor(() =>
      expect(LabelsAPI.read).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, page_size: 200 })
      )
    );
  });
  /*
   * A label carries no user_capabilities, so what the api allows has to be
   * worked out here: a superuser may edit and delete any label, and anyone
   * else only a label whose organization they administer. Both labels in the
   * fixture belong to organization 1.
   */
  describe('who may edit and delete', () => {
    /**
     * Renders the list as an ordinary user who administers some organizations.
     *
     * Args:
     *     adminOf: The ids of the organizations the user is an admin of.
     *
     * Returns:
     *     What renderWithContexts returns.
     */
    function renderAsAdminOf(adminOf: number[]) {
      vi.mocked(UsersAPI.readAdminOfOrganizations).mockResolvedValue({
        data: {
          count: adminOf.length,
          results: adminOf.map((id) => ({ id, name: `org ${id}` })),
        },
      } as unknown as ResponseOf<typeof UsersAPI.readAdminOfOrganizations>);
      return renderWithContexts(<LabelLists />, {
        context: { config: { me: { id: 7, is_superuser: false } } },
      });
    }

    test('offers neither to someone who administers no organization', async () => {
      const { user } = renderAsAdminOf([]);
      expect(await screen.findByText('production')).toBeInTheDocument();
      await waitFor(() =>
        expect(UsersAPI.readAdminOfOrganizations).toHaveBeenCalledWith(
          7,
          expect.objectContaining({ page: 1 })
        )
      );

      expect(
        screen.queryByRole('link', { name: 'Edit Label' })
      ).not.toBeInTheDocument();

      await user.click(screen.getAllByRole('checkbox')[1] as HTMLElement);
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      expect(deleteButton).toBeDisabled();
      // the reason names the label that holds the button back
      await user.hover(deleteButton.parentElement as HTMLElement);
      expect(
        await screen.findByText(
          'You do not have permission to delete Labels: production'
        )
      ).toBeInTheDocument();
    });

    test('offers neither to an admin of some other organization', async () => {
      const { user } = renderAsAdminOf([2]);
      expect(await screen.findByText('production')).toBeInTheDocument();
      await waitFor(() =>
        expect(UsersAPI.readAdminOfOrganizations).toHaveBeenCalled()
      );
      expect(
        screen.queryByRole('link', { name: 'Edit Label' })
      ).not.toBeInTheDocument();
      await user.click(screen.getAllByRole('checkbox')[1] as HTMLElement);
      expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
    });

    test("offers both to an admin of the label's organization", async () => {
      const { user } = renderAsAdminOf([1]);
      expect(
        await screen.findAllByRole('link', { name: 'Edit Label' })
      ).toHaveLength(2);
      expect(
        screen.getAllByRole('link', { name: 'Edit Label' })[0]
      ).toHaveAttribute('href', '/labels/1/edit');
      await user.click(screen.getAllByRole('checkbox')[1] as HTMLElement);
      expect(screen.getByRole('button', { name: /delete/i })).toBeEnabled();
    });

    /* Where the api reports what the reader may do with a label, that is
       what is followed, over what the organizations would say. */
    test('follows the capabilities the api reports', async () => {
      (LabelsAPI.read as unknown as ReturnType<typeof vi.fn>) = vi
        .fn()
        .mockResolvedValue({
          data: {
            count: 2,
            results: [
              {
                id: 1,
                name: 'production',
                summary_fields: {
                  organization: { id: 1, name: 'Default' },
                  user_capabilities: { edit: false, delete: false },
                },
              },
              {
                id: 2,
                name: 'spare',
                summary_fields: {
                  organization: { id: 1, name: 'Default' },
                  user_capabilities: { edit: true, delete: true },
                },
              },
            ],
          },
        });
      const { user } = renderWithContexts(<LabelLists />, {
        context: { config: { me: { id: 1, is_superuser: true } } },
      });
      expect(
        await screen.findAllByRole('link', { name: 'Edit Label' })
      ).toHaveLength(1);
      expect(screen.getByRole('link', { name: 'Edit Label' })).toHaveAttribute(
        'href',
        '/labels/2/edit'
      );
      await user.click(screen.getAllByRole('checkbox')[1] as HTMLElement);
      expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
    });

    test('offers both to a superuser, without asking which organizations', async () => {
      const { user } = renderWithContexts(<LabelLists />, {
        context: { config: { me: { id: 1, is_superuser: true } } },
      });
      expect(
        await screen.findAllByRole('link', { name: 'Edit Label' })
      ).toHaveLength(2);
      await user.click(screen.getAllByRole('checkbox')[1] as HTMLElement);
      expect(screen.getByRole('button', { name: /delete/i })).toBeEnabled();
      expect(UsersAPI.readAdminOfOrganizations).not.toHaveBeenCalled();
    });
  });
});
