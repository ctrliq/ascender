import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';

import { InstancesAPI } from 'api';
import useDebounce from 'hooks/useDebounce';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import InstanceListItem from './InstanceListItem';

jest.mock('../../../api');
jest.mock('../../../hooks/useDebounce');

// The component reads useParams from react-router-dom (the route
// tree is v6); mock it there, keeping the rest of the module real.
jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useParams: () => ({
    id: 1,
  }),
}));

const instance = [
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
    last_health_check: '2021-09-15T18:02:07.270664Z',
    cpu: 6,
    memory: 2087469056,
    cpu_capacity: 24,
    mem_capacity: 1,
    enabled: true,
    managed_by_policy: true,
    node_type: 'hybrid',
    node_state: 'ready',
  },
];

function renderItem(props = {}) {
  return renderWithContexts(
    <table>
      <tbody>
        <InstanceListItem
          instance={instance[0]}
          isSelected={false}
          onSelect={() => {}}
          fetchInstances={() => {}}
          {...props}
        />
      </tbody>
    </table>
  );
}

describe('<InstanceListItem/>', () => {
  beforeEach(() => {
    useDebounce.mockImplementation((fn) => fn);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render the proper data instance', () => {
    const { container } = renderItem();
    // name cell links to the instance detail page
    expect(screen.getByRole('link', { name: 'awx' })).toHaveAttribute(
      'href',
      '/instance_groups/1/instances/1/details'
    );
    // used capacity progress bar = 100 - 60 = 40
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '40'
    );
    expect(container.querySelector('[data-cy="cpu-capacity"]')).toHaveTextContent(
      'CPU 24'
    );
    expect(container.querySelector('[data-cy="mem-capacity"]')).toHaveTextContent(
      'RAM 1'
    );
    expect(container.querySelector('[data-cy="number-forks"]')).toHaveTextContent(
      '10 forks'
    );
  });

  test('moving the slider up recalculates forks and updates capacity', async () => {
    InstancesAPI.update.mockResolvedValue({ data: {} });
    const { container, user } = renderItem();
    const forks = () =>
      container.querySelector('[data-cy="number-forks"]').textContent;

    // capacity_adjustment 0.40 -> floor(1 + 23*0.4) = 10 forks
    expect(forks()).toContain('10 forks');

    // jsdom has no layout, so a keyboard ArrowRight on the PF slider snaps the
    // value to the max (1.0) -> floor(1 + 23*1) = 24 forks. The handler also
    // pushes the rounded capacity_adjustment to the API.
    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(forks()).toContain('24 forks'));
    expect(InstancesAPI.update).toHaveBeenCalledWith(1, {
      capacity_adjustment: 1,
    });
  });

  test('moving the slider down recalculates forks', async () => {
    InstancesAPI.update.mockResolvedValue({ data: {} });
    const { container, user } = renderItem();
    const forks = () =>
      container.querySelector('[data-cy="number-forks"]').textContent;

    expect(forks()).toContain('10 forks');

    // ArrowLeft steps the slider down by one 0.1 step: 0.40 -> 0.30 ->
    // floor(1 + 23*0.3) = 7 forks.
    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(forks()).toContain('7 forks'));
    expect(InstancesAPI.update).toHaveBeenCalledWith(1, {
      capacity_adjustment: 0.3,
    });
  });

  test('should render checkbox wired to onSelect', async () => {
    const onSelect = jest.fn();
    const { user } = renderItem({ onSelect });
    const row = screen.getByRole('link', { name: 'awx' }).closest('tr');
    // The first checkbox in the row is the row-select; the toggle is named.
    const checkbox = within(row)
      .getAllByRole('checkbox')
      .find((box) => box.getAttribute('aria-label') !== 'Toggle instance');
    await user.click(checkbox);
    expect(onSelect).toHaveBeenCalled();
  });

  test('should display instance toggle', () => {
    renderItem();
    expect(
      screen.getByRole('switch', { name: 'Toggle instance' })
    ).toBeInTheDocument();
  });

  test('should display error when capacity update fails', async () => {
    InstancesAPI.update.mockRejectedValue(new Error());
    const { user } = renderItem();
    expect(screen.queryByText('Error!')).not.toBeInTheDocument();

    const slider = screen.getByRole('slider');
    slider.focus();
    await user.keyboard('{ArrowRight}');

    await waitFor(() => expect(InstancesAPI.update).toHaveBeenCalled());
    expect(await screen.findByText('Error!')).toBeInTheDocument();
  });

  test('should render expanded row with the correct data points', () => {
    renderItem({ isExpanded: true });
    expect(screen.getByText('Running Jobs').nextElementSibling).toHaveTextContent(
      '0'
    );
    expect(screen.getByText('Total Jobs').nextElementSibling).toHaveTextContent(
      '68'
    );
    expect(screen.getByText('Policy Type').nextElementSibling).toHaveTextContent(
      'Auto'
    );
    expect(
      screen.getByText('Last Health Check').parentElement
    ).toHaveTextContent('9/15/2021, 6:02:07 PM');
  });
});
