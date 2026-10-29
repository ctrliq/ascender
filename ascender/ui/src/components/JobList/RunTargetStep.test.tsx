import React from 'react';
import { screen, within } from '@testing-library/react';
import { GroupsAPI, HostsAPI, InventoriesAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import RunTargetStep from './RunTargetStep';
import type { RunTarget } from './RunTargetStep';

vi.mock('../../api');

const page = <T,>(results: T[]) =>
  ({
    data: { count: results.length, results },
  }) as unknown as ResponseOf<typeof InventoriesAPI.read>;

const inInventory = (id: number, name: string) => ({
  summary_fields: { inventory: { id, name } },
});

const inventories = [
  { id: 1, name: 'first inventory' },
  { id: 2, name: 'second inventory' },
];
const groups = [
  { id: 20, name: 'webservers', ...inInventory(1, 'first inventory') },
];
const hosts = [
  { id: 10, name: 'web1', ...inInventory(1, 'first inventory') },
  { id: 11, name: 'web2', ...inInventory(1, 'first inventory') },
  { id: 12, name: 'db1', ...inInventory(2, 'second inventory') },
];

/*
 * Hosts and groups both inherit read() from Base, so the mock is one function
 * for the two of them: what it answers has to come from the model it was
 * called on, not from a per-model mockResolvedValue that the next one wipes.
 */
function readList(this: unknown) {
  if (this === GroupsAPI) {
    return Promise.resolve(page(groups));
  }
  if (this === HostsAPI) {
    return Promise.resolve(page(hosts));
  }
  return Promise.resolve(page([]));
}

describe('<RunTargetStep />', () => {
  beforeEach(() => {
    vi.mocked(InventoriesAPI.read).mockResolvedValue(page(inventories));
    vi.mocked(HostsAPI.read).mockImplementation(readList);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderStep(value: RunTarget | null = null) {
    const onChange = vi.fn();
    const result = renderWithContexts(
      <RunTargetStep value={value} onChange={onChange} />
    );
    /** What the step last answered, which is what the wizard reads. */
    const answer = () => onChange.mock.calls.at(-1)?.[0];
    return { ...result, onChange, answer };
  }

  /** A row's own tick box, which is how what to run on is chosen. */
  const tickFor = async (name: string) =>
    within(
      (await screen.findByText(name)).closest('tr') as HTMLElement
    ).getByRole('checkbox');

  const chooseKind = async (
    user: { selectOptions: (el: Element, value: string) => Promise<void> },
    kind: string
  ) =>
    user.selectOptions(screen.getByRole('combobox', { name: 'Run On' }), kind);

  test('should open on the inventories, which is what a run needs', async () => {
    const { answer } = renderStep();

    expect(await screen.findByText('first inventory')).toBeInTheDocument();
    expect(screen.getByText('second inventory')).toBeInTheDocument();
    // Nothing is ticked, so there is nowhere to run.
    expect(answer()).toBeNull();
  });

  /* Several inventories are several runs of the same thing. */
  test('should answer with every inventory ticked', async () => {
    const { user, answer } = renderStep();

    await user.click(await tickFor('first inventory'));
    await user.click(await tickFor('second inventory'));

    // A whole inventory is no pattern inside it, so there is no limit.
    expect(answer()).toMatchObject({
      kind: 'inventory',
      inventoryIds: [1, 2],
      limit: undefined,
      summary: 'first inventory, second inventory',
      inventoryNames: ['first inventory', 'second inventory'],
    });
  });

  test('should list the hosts, and answer with them as the limit', async () => {
    const { user, answer } = renderStep();
    await screen.findByText('first inventory');

    await chooseKind(user, 'host');
    await user.click(await tickFor('web1'));
    await user.click(await tickFor('web2'));

    // The preview repeats this line, so it reads as a sentence rather than
    // as the pattern the run is sent with.
    expect(answer()).toMatchObject({
      kind: 'host',
      inventoryIds: [1],
      limit: 'web1,web2',
      summary: 'web1, web2 in first inventory',
      inventoryNames: ['first inventory'],
    });
  });

  test('should list the groups, with the inventory each is in', async () => {
    const { user } = renderStep();
    await screen.findByText('first inventory');

    await chooseKind(user, 'group');

    const row = (await screen.findByText('webservers')).closest(
      'tr'
    ) as HTMLElement;
    expect(within(row).getByText('first inventory')).toBeInTheDocument();
  });

  /*
   * A run happens in one inventory, so hosts from two of them are not one
   * run: the reader is told rather than left with a Next that does nothing.
   */
  test('should refuse hosts from more than one inventory', async () => {
    const { user, answer } = renderStep();
    await screen.findByText('first inventory');

    await chooseKind(user, 'host');
    await user.click(await tickFor('web1'));
    await user.click(await tickFor('db1'));

    expect(
      await screen.findByText(/One run happens in one inventory/)
    ).toBeInTheDocument();
    expect(answer()).toBeNull();
  });

  test('should forget what was ticked when the kind changes', async () => {
    const { user, answer } = renderStep();

    await user.click(await tickFor('first inventory'));
    await chooseKind(user, 'host');

    await screen.findByText('web1');
    expect(answer()).toBeNull();
  });

  /*
   * Picking a template rebuilds the wizard this sits in, so the step comes
   * back: it opens on the kind and the rows it was answered with, and says
   * so without being ticked again.
   */
  test('should open again on what it was answered with', async () => {
    const { answer } = renderStep({
      kind: 'host',
      inventoryIds: [1],
      limit: 'web1',
      items: hosts.slice(0, 1),
      summary: 'web1 in first inventory',
      inventoryNames: ['first inventory'],
    });

    const row = (await screen.findByText('web1')).closest('tr') as HTMLElement;
    expect(within(row).getByRole('checkbox')).toBeChecked();
    expect(answer()).toMatchObject({ kind: 'host', limit: 'web1' });
  });

  /*
   * Ansible splits a pattern with no comma in it on its colons, unless it
   * reads as one address, so a lone host whose name holds a colon is sent as
   * a list of one rather than as two names.
   */
  test('should keep a lone host with a colon in its name whole', async () => {
    vi.mocked(HostsAPI.read).mockResolvedValue(
      page([
        { id: 30, name: 'db:primary', ...inInventory(1, 'first inventory') },
      ])
    );
    const { user, answer } = renderStep();
    await screen.findByText('first inventory');

    await chooseKind(user, 'host');
    await user.click(await tickFor('db:primary'));

    expect(answer()).toMatchObject({ limit: 'db:primary,' });
  });

  /*
   * Ticks outlive a page turn. Select all is about the page on screen: it is
   * not ticked because as many rows are ticked elsewhere as this page holds,
   * and ticking it adds this page's rows to those rather than replacing them.
   */
  describe('select all, with rows ticked on another page', () => {
    const elsewhere = [
      { id: 97, name: 'far1', ...inInventory(1, 'first inventory') },
      { id: 98, name: 'far2', ...inInventory(1, 'first inventory') },
    ];

    function renderWithTicksElsewhere() {
      vi.mocked(HostsAPI.read).mockResolvedValue(page(hosts.slice(0, 2)));
      return renderStep({
        kind: 'host',
        inventoryIds: [1],
        limit: 'far1,far2',
        items: elsewhere,
        summary: 'far1, far2 in first inventory',
        inventoryNames: ['first inventory'],
      });
    }

    test('should not read as ticked for this page', async () => {
      renderWithTicksElsewhere();
      await screen.findByText('web1');

      expect(
        screen.getByRole('checkbox', { name: 'Select all' })
      ).not.toBeChecked();
    });

    test('should add this page to what is ticked', async () => {
      const { user, answer } = renderWithTicksElsewhere();
      await screen.findByText('web1');

      await user.click(screen.getByRole('checkbox', { name: 'Select all' }));

      expect(
        screen.getByRole('checkbox', { name: 'Select all' })
      ).toBeChecked();
      expect(answer()).toMatchObject({ limit: 'far1,far2,web1,web2' });

      await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
      expect(answer()).toMatchObject({ limit: 'far1,far2' });
    });
  });
});
