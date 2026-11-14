import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { CredentialTypesAPI, InventoriesAPI } from 'api';
import { FormRoot } from 'components/Form';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import type { RunTarget } from './RunTargetStep';
import RunCommandWizard from './RunCommandWizard';

vi.mock('../../api');

/*
 * The form itself has tests of its own. Here it is a launch button that
 * answers with a filled form, and the step before it a button that answers
 * with what was ticked, so what is under test is what the wizard does with
 * the two: which inventories it sends the command to, and where it goes.
 */
let target: RunTarget | null = null;
vi.mock('./RunTargetStep', () => ({
  default: ({ onChange }: { onChange: (next: RunTarget | null) => void }) => (
    <button type="button" onClick={() => onChange(target)}>
      Tick
    </button>
  ),
}));
vi.mock('components/AdHocCommands/AdHocCommandsWizard', () => ({
  default: ({
    firstStep,
    onLaunch,
  }: {
    firstStep: { component: React.ReactNode };
    onLaunch: (values: Record<string, unknown>) => void;
  }) => (
    <FormRoot initialValues={{}} onSubmit={() => {}}>
      {firstStep.component}
      <button
        type="button"
        onClick={() =>
          onLaunch({
            credentials: [{ id: 3 }],
            credential_passwords: {},
            execution_environment: null,
            module_name: 'ping',
            limit: 'all',
          })
        }
      >
        Launch
      </button>
    </FormRoot>
  ),
}));

function inventories(ids: number[], names: string[]): RunTarget {
  return {
    kind: 'inventory',
    inventoryIds: ids,
    items: [],
    summary: names.join(', '),
    inventoryNames: names,
  };
}

function refusal(detail: string) {
  return Object.assign(new Error('refused'), {
    response: { status: 400, data: { detail } },
  });
}

async function launchOn(ticked: RunTarget) {
  target = ticked;
  const onClose = vi.fn();
  const utils = renderWithContexts(<RunCommandWizard onClose={onClose} />);
  await utils.user.click(screen.getByRole('button', { name: 'Tick' }));
  await utils.user.click(screen.getByRole('button', { name: 'Launch' }));
  return { ...utils, onClose };
}

describe('<RunCommandWizard />', () => {
  beforeEach(() => {
    vi.mocked(InventoriesAPI.readAdHocOptions).mockResolvedValue({
      data: { actions: { GET: { module_name: { choices: [] } } } },
    } as unknown as ResponseOf<typeof InventoriesAPI.readAdHocOptions>);
    vi.mocked(InventoriesAPI.readDetail).mockResolvedValue({
      data: { id: 1, organization: 1 },
    } as unknown as ResponseOf<typeof InventoriesAPI.readDetail>);
    vi.mocked(CredentialTypesAPI.read).mockResolvedValue({
      data: { count: 1, results: [{ id: 1 }] },
    } as unknown as ResponseOf<typeof CredentialTypesAPI.read>);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  /* The wizard is the caller's to take down, and it used to be left up over
     the output of the command it had just started. */
  test('should close on the way to the command it started', async () => {
    vi.mocked(InventoriesAPI.launchAdHocCommands).mockResolvedValue({
      data: { id: 55 },
    } as unknown as ResponseOf<typeof InventoriesAPI.launchAdHocCommands>);
    const { history, onClose } = await launchOn(inventories([1], ['one']));

    await waitFor(() =>
      expect(history.location.pathname).toEqual('/runs/command/55/output')
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(InventoriesAPI.launchAdHocCommands).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ credential: 3, module_name: 'ping' })
    );
  });

  /*
   * One inventory refusing does not stop the command in the others, and the
   * runs list, where the ones that started are, is handed the refusal with
   * its reason to say.
   */
  test('should start what it can and hand over what it could not', async () => {
    vi.mocked(InventoriesAPI.launchAdHocCommands).mockImplementation(
      async (id) => {
        if (id === 2) {
          throw refusal('No hosts in this inventory');
        }
        return { data: { id: 60 } } as unknown as ResponseOf<
          typeof InventoriesAPI.launchAdHocCommands
        >;
      }
    );
    const { history, onClose } = await launchOn(
      inventories([1, 2, 3], ['one', 'two', 'three'])
    );

    await waitFor(() => expect(history.location.pathname).toEqual('/runs'));
    expect(InventoriesAPI.launchAdHocCommands).toHaveBeenCalledTimes(3);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(history.location.state).toEqual({
      notStarted: [
        expect.objectContaining({
          name: 'two',
          error: expect.objectContaining({
            response: expect.objectContaining({
              data: { detail: 'No hosts in this inventory' },
            }),
          }),
        }),
      ],
    });
  });

  test('should name every refusal where nothing started', async () => {
    vi.mocked(InventoriesAPI.launchAdHocCommands).mockRejectedValue(
      refusal('Inventory is locked')
    );
    const { history, onClose } = await launchOn(
      inventories([1, 2], ['one', 'two'])
    );

    expect(
      await screen.findByText('Not started: one, two')
    ).toBeInTheDocument();
    expect(history.location.pathname).toEqual('/');
    expect(onClose).not.toHaveBeenCalled();
  });
});
