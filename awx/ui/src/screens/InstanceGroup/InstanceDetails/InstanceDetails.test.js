import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import * as ConfigContext from 'contexts/Config';
import useDebounce from 'hooks/useDebounce';
import { InstancesAPI, InstanceGroupsAPI } from 'api';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';
import InstanceDetails from './InstanceDetails';

jest.mock('../../../api');
jest.mock('../../../hooks/useDebounce');
// The component reads useParams from react-router-dom (the route
// tree is v6); mock it there, keeping the rest of the module real.
jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useParams: () => ({
    id: 2,
    instanceId: 1,
  }),
}));

const instanceGroup = {
  id: 2,
  type: 'instance_group',
  url: '/api/v2/instance_groups/2/',
  related: {
    named_url: '/api/v2/instance_groups/default/',
    jobs: '/api/v2/instance_groups/2/jobs/',
    instances: '/api/v2/instance_groups/2/instances/',
  },
  name: 'default',
  created: '2021-09-08T17:10:39.947029Z',
  modified: '2021-09-08T17:10:39.959187Z',
  capacity: 38,
  committed_capacity: 0,
  consumed_capacity: 0,
  percent_capacity_remaining: 100.0,
  jobs_running: 0,
  jobs_total: 0,
  instances: 3,
  is_container_group: false,
  credential: null,
  policy_instance_percentage: 100,
  policy_instance_minimum: 0,
  max_concurrent_jobs: 0,
  max_forks: 0,
  policy_instance_list: ['receptor-1', 'receptor-2'],
  pod_spec_override: '',
  summary_fields: {
    user_capabilities: {
      edit: true,
      delete: true,
    },
  },
};

const associatedInstances = {
  data: {
    results: [{ id: 1 }, { id: 2 }],
  },
};

function instanceDetail(overrides = {}) {
  return {
    data: {
      id: 1,
      type: 'instance',
      url: '/api/v2/instances/1/',
      related: {
        named_url: '/api/v2/instances/awx_1/',
        jobs: '/api/v2/instances/1/jobs/',
        instance_groups: '/api/v2/instances/1/instance_groups/',
        health_check: '/api/v2/instances/1/health_check/',
      },
      uuid: '00000000-0000-0000-0000-000000000000',
      hostname: 'awx_1',
      created: '2021-09-08T17:10:34.484569Z',
      modified: '2021-09-09T13:55:44.219900Z',
      last_seen: '2021-09-09T20:20:31.623148Z',
      last_health_check: '2021-09-09T20:20:31.623148Z',
      errors: '',
      capacity_adjustment: '1.00',
      version: '19.1.0',
      capacity: 38,
      consumed_capacity: 0,
      percent_capacity_remaining: 100.0,
      jobs_running: 0,
      jobs_total: 0,
      cpu: 8,
      memory: 6232231936,
      cpu_capacity: 32,
      mem_capacity: 38,
      enabled: true,
      managed_by_policy: true,
      node_type: 'execution',
      node_state: 'ready',
      health_check_pending: false,
      ...overrides,
    },
  };
}

function setMe(me) {
  jest.spyOn(ConfigContext, 'useConfig').mockImplementation(() => ({ me }));
}

function renderDetails() {
  return renderWithContexts(
    <InstanceDetails instanceGroup={instanceGroup} setBreadcrumb={() => {}} />
  );
}

describe('<InstanceDetails/>', () => {
  beforeEach(() => {
    useDebounce.mockImplementation((fn) => fn);
    InstanceGroupsAPI.readInstances.mockResolvedValue(associatedInstances);
    InstancesAPI.readDetail.mockResolvedValue(instanceDetail());
    InstancesAPI.readHealthCheckDetail.mockResolvedValue({
      data: {
        uuid: '00000000-0000-0000-0000-000000000000',
        hostname: 'awx_1',
        version: '19.1.0',
        last_health_check: '2021-09-10T16:16:19.729676Z',
        errors: '',
        cpu: 8,
        memory: 6232231936,
        cpu_capacity: 32,
        mem_capacity: 38,
        capacity: 38,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render proper data', async () => {
    setMe({ is_superuser: true });
    renderDetails();
    await screen.findByRole('button', { name: 'Run health check' });

    expect(InstanceGroupsAPI.readInstances).toHaveBeenCalledWith(2);
    expect(InstancesAPI.readHealthCheckDetail).toHaveBeenCalledWith(1);
    expect(InstancesAPI.readDetail).toHaveBeenCalledWith(1);

    expect(
      screen.getByRole('button', { name: 'Disassociate' })
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Run health check' })
    ).toBeEnabled();
  });

  test('should recalculate number of forks when slider changes', async () => {
    setMe({ is_superuser: true });
    InstancesAPI.update.mockResolvedValue({ data: {} });
    const { container, user } = renderDetails();
    await screen.findByRole('button', { name: 'Run health check' });

    const forks = () =>
      container.querySelector('[data-cy="number-forks"]').textContent;
    // mem 38, cpu 32, adjustment 1.0 -> floor(32 + 6*1) = 38 forks
    expect(forks()).toContain('38 forks');

    // ArrowLeft steps the slider down one 0.1 step: 1.0 -> 0.9 ->
    // floor(32 + 6*0.9) = 37 forks.
    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(forks()).toContain('37 forks'));
  });

  test('buttons should be disabled for non-superuser', async () => {
    setMe({ is_system_auditor: true });
    renderDetails();
    await screen.findByRole('button', { name: 'Run health check' });

    // Disassociate is only rendered for superusers.
    expect(
      screen.queryByRole('button', { name: 'Disassociate' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Run health check' })
    ).toBeDisabled();
  });

  test('should display instance toggle', async () => {
    setMe({ is_system_auditor: true });
    renderDetails();
    await screen.findByRole('button', { name: 'Run health check' });

    expect(
      screen.getByRole('switch', { name: 'Toggle instance' })
    ).toBeInTheDocument();
  });

  test('should throw error because instance is not associated with instance group', async () => {
    setMe({ is_superuser: true });
    InstanceGroupsAPI.readInstances.mockResolvedValue({
      data: { results: [{ id: 3 }, { id: 3 }] },
    });
    renderDetails();

    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
    expect(InstanceGroupsAPI.readInstances).toHaveBeenCalledWith(2);
    expect(InstancesAPI.readHealthCheckDetail).not.toHaveBeenCalled();
    expect(InstancesAPI.readDetail).not.toHaveBeenCalled();
  });

  test('should handle api error for health check', async () => {
    setMe({ is_superuser: true });
    InstancesAPI.healthCheck.mockRejectedValue(new Error());
    const { user } = renderDetails();
    const healthCheck = await screen.findByRole('button', {
      name: 'Run health check',
    });
    expect(healthCheck).toBeEnabled();

    await user.click(healthCheck);
    await waitFor(() =>
      expect(InstancesAPI.healthCheck).toHaveBeenCalledWith(1)
    );
    expect(await screen.findByText('Error!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await settleTooltips();
    expect(screen.queryByText('Error!')).not.toBeInTheDocument();
  });

  test.each([
    ['hybrid'],
    ['hop'],
    ['control'],
  ])('hide health check button for %s (non-execution) nodes', async (nodeType) => {
    setMe({ is_superuser: true });
    InstancesAPI.readDetail.mockResolvedValue(
      instanceDetail({ node_type: nodeType })
    );
    renderDetails();
    // The toggle always renders once details load; use it as a ready signal.
    await screen.findByRole('switch', { name: 'Toggle instance' });

    expect(
      screen.queryByRole('button', { name: 'Run health check' })
    ).not.toBeInTheDocument();
  });

  test('should call disassociate', async () => {
    setMe({ is_superuser: true });
    InstanceGroupsAPI.disassociateInstance.mockResolvedValue({});
    const { user } = renderDetails();
    await screen.findByRole('button', { name: 'Disassociate' });

    await user.click(screen.getByRole('button', { name: 'Disassociate' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm disassociate' })
    );

    await waitFor(() =>
      expect(InstanceGroupsAPI.disassociateInstance).toHaveBeenCalledWith(2, 1)
    );
    // Closing the modal refocuses the Tooltip-wrapped health-check button.
    await settleTooltips();
  });

  test('should throw disassociate error', async () => {
    setMe({ is_superuser: true });
    InstanceGroupsAPI.disassociateInstance.mockRejectedValue(new Error());
    const { user } = renderDetails();
    await screen.findByRole('button', { name: 'Disassociate' });

    await user.click(screen.getByRole('button', { name: 'Disassociate' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm disassociate' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
    // Closing the modal refocuses the Tooltip-wrapped health-check button.
    await settleTooltips();
  });
});
