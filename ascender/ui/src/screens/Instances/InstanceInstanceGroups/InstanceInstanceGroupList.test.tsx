import React from 'react';
import { Routes, Route } from 'react-router';
import { act, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import { InstancesAPI, InstanceGroupsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';

import InstanceInstanceGroupList from './InstanceInstanceGroupList';

vi.mock('../../../api');

/** A group as the list reads it, with only what the row shows. */
function group(id: number, name: string) {
  return {
    id,
    name,
    type: 'instance_group',
    is_container_group: false,
    capacity: 10,
    percent_capacity_remaining: 50,
    jobs_running: 0,
    jobs_total: 3,
    instances: 1,
    summary_fields: { user_capabilities: { edit: true, delete: false } },
  };
}

const groups = [group(1, 'controlplane'), group(2, 'default')];

// The instance as the instance screen read it and hands it down.
let instance: Record<string, unknown>;

function mockInstance(detail: Record<string, unknown>) {
  instance = { id: 7, hostname: 'node-1', managed_by_policy: false, ...detail };
}

function setup(
  me: { is_superuser: boolean } = { is_superuser: true },
  controlPlaneName?: string
) {
  const history = createMemoryHistory({
    initialEntries: ['/instances/7/instance_groups'],
  });
  const result = renderWithContexts(
    <Routes>
      <Route
        path="/instances/:id/instance_groups"
        element={
          <InstanceInstanceGroupList
            instance={instance}
            controlPlaneName={controlPlaneName}
            setBreadcrumb={() => {}}
          />
        }
      />
    </Routes>,
    { context: { router: { history }, config: { me } } }
  );
  return { ...result, history };
}

describe('<InstanceInstanceGroupList />', () => {
  beforeEach(() => {
    mockInstance({ node_type: 'hybrid' });
    vi.mocked(InstancesAPI.readInstanceGroups).mockResolvedValue({
      data: { count: groups.length, results: groups },
    } as unknown as ResponseOf<typeof InstancesAPI.readInstanceGroups>);
    vi.mocked(InstancesAPI.readInstanceGroupOptions).mockResolvedValue({
      data: { actions: { GET: {}, POST: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof InstancesAPI.readInstanceGroupOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('lists the groups the instance belongs to', async () => {
    setup();
    expect(
      await screen.findByRole('link', { name: 'controlplane' })
    ).toHaveAttribute('href', '/instance_groups/1/details');
    expect(screen.getByRole('link', { name: 'default' })).toBeInTheDocument();
    expect(InstancesAPI.readInstanceGroups).toHaveBeenCalledWith(
      '7',
      expect.objectContaining({ order_by: 'name' })
    );
  });

  test('offers groups the instance is not in, leaving container groups out', async () => {
    vi.mocked(InstanceGroupsAPI.read).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof InstanceGroupsAPI.read>);
    vi.mocked(InstanceGroupsAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof InstanceGroupsAPI.readOptions>);
    const { user } = setup();
    await screen.findByRole('link', { name: 'default' });

    await user.click(screen.getByRole('button', { name: 'Associate' }));
    expect(
      await screen.findByRole('dialog', { name: /Associate Instance Groups/ })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(InstanceGroupsAPI.read).toHaveBeenCalledWith(
        expect.objectContaining({
          not__instances__id: '7',
          is_container_group: false,
        })
      )
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await settleTooltips();
  });

  test('disassociates the instance from a selected group', async () => {
    vi.mocked(InstancesAPI.disassociateInstanceGroup).mockResolvedValue(
      {} as unknown as ResponseOf<typeof InstancesAPI.disassociateInstanceGroup>
    );
    const { user } = setup();
    const row = (await screen.findByRole('link', { name: 'default' })).closest(
      'tr'
    );
    await user.click(within(row!).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Disassociate' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Disassociate' })
    );

    await waitFor(() =>
      expect(InstancesAPI.disassociateInstanceGroup).toHaveBeenCalledWith(
        '7',
        2
      )
    );
  });

  test('holds controlplane back from disassociating a hybrid node', async () => {
    const { user } = setup();
    const row = (
      await screen.findByRole('link', { name: 'controlplane' })
    ).closest('tr');
    await user.click(within(row!).getByRole('checkbox'));

    const button = screen.getByRole('button', { name: 'Disassociate' });
    expect(button).toBeDisabled();
    // The reason is the group, not the viewer's rights.
    await user.hover(button.parentElement!);
    expect(
      await screen.findByText(
        'Hybrid nodes cannot be disassociated from controlplane: controlplane'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/do not have permission/)
    ).not.toBeInTheDocument();
  });

  // The api keeps only hybrid nodes in controlplane, so an execution node
  // that was put there may be taken out again.
  test('lets an execution node leave controlplane', async () => {
    mockInstance({ node_type: 'execution' });
    vi.mocked(InstancesAPI.disassociateInstanceGroup).mockResolvedValue(
      {} as unknown as ResponseOf<typeof InstancesAPI.disassociateInstanceGroup>
    );
    const { user } = setup();
    const row = (
      await screen.findByRole('link', { name: 'controlplane' })
    ).closest('tr');
    await user.click(within(row!).getByRole('checkbox'));

    const button = screen.getByRole('button', { name: 'Disassociate' });
    expect(button).toBeEnabled();
    await user.click(button);
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Disassociate' })
    );
    await waitFor(() =>
      expect(InstancesAPI.disassociateInstanceGroup).toHaveBeenCalledWith(
        '7',
        1
      )
    );
  });

  test('leaves membership alone for a user who is not a superuser', async () => {
    setup({ is_superuser: false });
    await screen.findByRole('link', { name: 'default' });

    expect(
      screen.queryByRole('button', { name: 'Associate' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Disassociate' })
    ).not.toBeInTheDocument();
    // Nor anything to select: the selection is only ever for disassociating.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  test('holds back the control plane group under the name the install gives it', async () => {
    const { user } = setup({ is_superuser: true }, 'default');
    const row = (await screen.findByRole('link', { name: 'default' })).closest(
      'tr'
    );
    await user.click(within(row!).getByRole('checkbox'));

    const button = screen.getByRole('button', { name: 'Disassociate' });
    expect(button).toBeDisabled();
    await user.hover(button.parentElement!);
    expect(
      await screen.findByText(
        'Hybrid nodes cannot be disassociated from default: default'
      )
    ).toBeInTheDocument();
  });

  test('reads neither the instance nor the options again on a search', async () => {
    const { history } = setup();
    await screen.findByRole('link', { name: 'default' });
    expect(InstancesAPI.readInstanceGroupOptions).toHaveBeenCalledTimes(1);

    act(() => {
      history.push('/instances/7/instance_groups?instance_group.page=2');
    });
    await waitFor(() =>
      expect(InstancesAPI.readInstanceGroups).toHaveBeenCalledTimes(2)
    );
    await screen.findByRole('link', { name: 'default' });
    expect(InstancesAPI.readInstanceGroupOptions).toHaveBeenCalledTimes(1);
    expect(InstancesAPI.readDetail).not.toHaveBeenCalled();
  });

  test.each([['control'], ['hop']])(
    'leaves membership alone for a %s node, as the api does',
    async (nodeType) => {
      mockInstance({ node_type: nodeType });
      setup();
      await screen.findByRole('link', { name: 'default' });

      expect(
        screen.queryByRole('button', { name: 'Associate' })
      ).not.toBeInTheDocument();
      expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    }
  );
});
