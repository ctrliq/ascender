import React from 'react';
import { Route } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import { InstancesAPI, InstanceGroupsAPI } from 'api';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../testUtils/rtlContexts';

import InstanceList from './InstanceList';

jest.mock('../../../api');
// InstanceList reads useParams from react-router-dom-v5-compat (the route tree
// is v6); mock it there, keeping the rest of the module real.
jest.mock('react-router-dom-v5-compat', () => ({
  ...jest.requireActual('react-router-dom-v5-compat'),
  useParams: () => ({
    id: 1,
    instanceGroupId: 2,
  }),
}));

const instances = [
  {
    id: 1,
    type: 'instance',
    url: '/api/v2/instances/1/',
    related: {
      jobs: '/api/v2/instances/1/jobs/',
      instance_groups: '/api/v2/instances/1/instance_groups/',
    },
    uuid: '00000000-0000-0000-0000-000000000000',
    hostname: 'awx',
    created: '2020-07-14T19:03:49.000054Z',
    modified: '2020-08-12T20:08:02.836748Z',
    capacity_adjustment: '0.40',
    version: '13.0.0',
    capacity: 10,
    consumed_capacity: 0,
    percent_capacity_remaining: 60.0,
    jobs_running: 0,
    jobs_total: 68,
    cpu: 6,
    node_type: 'control',
    node_state: 'ready',
    memory: 2087469056,
    cpu_capacity: 24,
    mem_capacity: 1,
    enabled: true,
    managed_by_policy: true,
  },
  {
    id: 2,
    type: 'instance',
    url: '/api/v2/instances/2/',
    related: {
      jobs: '/api/v2/instances/2/jobs/',
      instance_groups: '/api/v2/instances/2/instance_groups/',
    },
    uuid: '00000000-0000-0000-0000-000000000000',
    hostname: 'foo',
    created: '2020-07-14T19:03:49.000054Z',
    modified: '2020-08-12T20:08:02.836748Z',
    capacity_adjustment: '0.40',
    version: '13.0.0',
    capacity: 10,
    consumed_capacity: 0,
    percent_capacity_remaining: 60.0,
    jobs_running: 0,
    jobs_total: 68,
    cpu: 6,
    node_type: 'hybrid',
    node_state: 'ready',
    memory: 2087469056,
    cpu_capacity: 24,
    mem_capacity: 1,
    enabled: true,
    managed_by_policy: false,
  },
  {
    id: 3,
    type: 'instance',
    url: '/api/v2/instances/3/',
    related: {
      jobs: '/api/v2/instances/3/jobs/',
      instance_groups: '/api/v2/instances/3/instance_groups/',
    },
    uuid: '00000000-0000-0000-0000-000000000000',
    hostname: 'bar',
    created: '2020-07-14T19:03:49.000054Z',
    modified: '2020-08-12T20:08:02.836748Z',
    capacity_adjustment: '0.40',
    version: '13.0.0',
    capacity: 10,
    consumed_capacity: 0,
    percent_capacity_remaining: 60.0,
    jobs_running: 0,
    jobs_total: 68,
    cpu: 6,
    node_type: 'execution',
    node_state: 'ready',
    memory: 2087469056,
    cpu_capacity: 24,
    mem_capacity: 1,
    enabled: false,
    managed_by_policy: true,
  },
];

const options = { data: { actions: { POST: true } } };

function setup() {
  const history = createMemoryHistory({
    initialEntries: ['/instance_groups/1/instances'],
  });
  return renderWithContexts(
    <Route path="/instance_groups/:id/instances">
      <InstanceList instanceGroup={{ name: 'Alex' }} />
    </Route>,
    { context: { router: { history } } }
  );
}

describe('<InstanceList/>', () => {
  beforeEach(() => {
    InstanceGroupsAPI.readInstances.mockResolvedValue({
      data: {
        count: instances.length,
        results: instances,
      },
    });
    InstanceGroupsAPI.readInstanceOptions.mockResolvedValue(options);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should fetch instances from the api and render them in the list', async () => {
    setup();
    await screen.findByRole('link', { name: 'awx' });

    expect(InstanceGroupsAPI.readInstances).toHaveBeenCalled();
    expect(InstanceGroupsAPI.readInstanceOptions).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'awx' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'foo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'bar' })).toBeInTheDocument();
  });

  test('should show associate modal when adding an existing instance', async () => {
    InstancesAPI.read.mockResolvedValue({ data: { count: 0, results: [] } });
    InstancesAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    });
    const { user } = setup();
    await screen.findByRole('link', { name: 'awx' });

    await user.click(screen.getByRole('button', { name: /Associate/ }));
    expect(
      await screen.findByRole('dialog', { name: /Select Instances/ })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /Select Instances/ })
      ).not.toBeInTheDocument()
    );
    // Closing the modal refocuses the Tooltip-wrapped Associate button.
    await settleTooltips();
  });

  test('should run health check on selected execution instances', async () => {
    InstancesAPI.healthCheck.mockResolvedValue({ data: {} });
    const { user } = setup();
    await screen.findByRole('link', { name: 'awx' });

    const healthCheck = screen.getByRole('button', { name: 'Run health check' });
    expect(healthCheck).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await waitFor(() => expect(healthCheck).toBeEnabled());

    await user.click(healthCheck);
    // Only the execution node (id 3) is health-checked.
    await waitFor(() =>
      expect(InstancesAPI.healthCheck).toHaveBeenCalledTimes(1)
    );
    expect(InstancesAPI.healthCheck).toHaveBeenCalledWith(3);
    // A success alert appears; await it so async state settles before unmount.
    expect(
      await screen.findByText(/Health check request\(s\) submitted/)
    ).toBeInTheDocument();
    // handleHealthCheck clears the selection after the request resolves; wait
    // for the resulting re-render so no state update lands after unmount.
    await waitFor(() => expect(healthCheck).toBeDisabled());
  });

  test('should render health check error', async () => {
    InstancesAPI.healthCheck.mockRejectedValue(new Error());
    const { user } = setup();
    await screen.findByRole('link', { name: 'awx' });

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    const healthCheck = screen.getByRole('button', { name: 'Run health check' });
    await waitFor(() => expect(healthCheck).toBeEnabled());

    await user.click(healthCheck);
    expect(await screen.findByText('Error!')).toBeInTheDocument();
    // Dismiss the modal so the error/selection state unwinds before unmount.
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
  });

  test('disassociate button is disabled until a non-control instance is selected', async () => {
    const { user } = setup();
    await screen.findByRole('link', { name: 'awx' });

    const disassociate = screen.getByRole('button', { name: 'Disassociate' });
    expect(disassociate).toBeDisabled();

    // Selecting all includes the control node (awx), keeping it disabled.
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(disassociate).toBeDisabled();

    // Deselecting the control node leaves only non-control nodes -> enabled.
    const controlRow = screen.getByRole('link', { name: 'awx' }).closest('tr');
    const controlCheckbox = within(controlRow)
      .getAllByRole('checkbox')
      .find((box) => box.getAttribute('aria-label') !== 'Toggle instance');
    await user.click(controlCheckbox);

    await waitFor(() => expect(disassociate).toBeEnabled());
  });
});
