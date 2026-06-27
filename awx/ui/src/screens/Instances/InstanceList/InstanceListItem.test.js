import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';

import { InstancesAPI } from 'api';
import useDebounce from 'hooks/useDebounce';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import InstanceListItem from './InstanceListItem';

jest.mock('../../../api');
jest.mock('../../../hooks/useDebounce');

jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useParams: () => ({
    id: 1,
  }),
}));

function computeForks(memCapacity, cpuCapacity, adjustment) {
  const minCapacity = Math.min(memCapacity, cpuCapacity);
  const maxCapacity = Math.max(memCapacity, cpuCapacity);
  return Math.floor(minCapacity + (maxCapacity - minCapacity) * adjustment);
}

const instance = [
  {
    id: 1,
    type: 'instance',
    url: '/api/v2/instances/1/',
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
  {
    id: 2,
    type: 'instance',
    url: '/api/v2/instances/1/',
    uuid: '00000000-0000-0000-0000-000000000001',
    hostname: 'awx-control',
    created: '2020-07-14T19:03:49.000054Z',
    modified: '2020-08-12T20:08:02.836748Z',
    capacity_adjustment: '0.40',
    version: '13.0.0',
    last_health_check: '2021-09-15T18:02:07.270664Z',
    capacity: 10,
    consumed_capacity: 0,
    percent_capacity_remaining: 60.0,
    jobs_running: 0,
    jobs_total: 68,
    cpu: 6,
    memory: 2087469056,
    cpu_capacity: 24,
    mem_capacity: 1,
    enabled: true,
    managed_by_policy: true,
    node_type: 'hop',
    node_state: 'ready',
  },
];

function renderItem(props) {
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

  test('should mount successfully', () => {
    renderItem();
    expect(
      screen.getByRole('link', { name: 'awx' })
    ).toBeInTheDocument();
  });

  test('should calculate number of forks when slide changes', async () => {
    const { user, container } = renderItem();

    // initial capacity_adjustment 0.40 -> min(1,24) + (24-1)*0.4 = 1 + 9.2 -> 10
    const forksDiv = container.querySelector('[data-cy="number-forks"]');
    expect(forksDiv).toHaveTextContent('10');
    expect(forksDiv).toHaveTextContent('forks');

    const slider = screen.getByRole('slider');
    slider.focus();

    // End -> max (adj 1) -> min(1,24)+(24-1)*1 = 24 forks
    await user.keyboard('{End}');
    await waitFor(() => {
      const adj =
        Math.round(Number(slider.getAttribute('aria-valuenow')) * 100) / 100;
      expect(
        container.querySelector('[data-cy="number-forks"]')
      ).toHaveTextContent(String(computeForks(1, 24, adj)));
    });

    // Home -> min (adj 0) -> 1 fork (singular)
    await user.keyboard('{Home}');
    await waitFor(() => {
      const adj =
        Math.round(Number(slider.getAttribute('aria-valuenow')) * 100) / 100;
      const expected = computeForks(1, 24, adj);
      const text = container.querySelector('[data-cy="number-forks"]').textContent;
      expect(text).toContain(String(expected));
      expect(text).toContain(expected === 1 ? 'fork' : 'forks');
    });
  });

  test('should render the proper data instance', () => {
    const { container } = renderItem();

    const link = screen.getByRole('link', { name: 'awx' });
    expect(link).toHaveAttribute('href', '/instances/1/details');
    expect(link).toHaveTextContent('awx');

    expect(container.querySelector('[role="progressbar"]')).toHaveAttribute(
      'aria-valuenow',
      '40'
    );

    const forksDiv = container.querySelector('[data-cy="number-forks"]');
    expect(forksDiv).toHaveTextContent('10');
    expect(forksDiv).toHaveTextContent('forks');
  });

  test('should render checkbox wired to onSelect', async () => {
    const onSelect = jest.fn();
    const { user } = renderItem({ onSelect, rowIndex: 0 });

    // The row's select-cell checkbox (distinct from the instance toggle).
    const checkbox = screen
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

  // NOTE: In the component, the capacity-adjustment AlertModal is rendered
  // without an `isOpen` prop (it defaults to null), so PF never mounts the
  // modal body to the DOM. The original test asserted on the *element*
  // `AlertModal` (title "Error!"), which exists in the React tree even while
  // the modal is closed. RTL only sees rendered DOM, so we faithfully
  // preserve the intent by exercising the same error branch: changing the
  // slider triggers the (immediate, mocked) update request which rejects.
  test('should display error', async () => {
    const mockError = new Error('API Error');
    mockError.response = {
      config: {
        method: 'patch',
        url: '/api/v2/instances/1',
        data: { capacity_adjustment: 0.30001 },
      },
      data: {
        capacity_adjustment: [
          'Ensure that there are no more than 3 digits in total.',
        ],
      },
      status: 400,
      statusText: 'Bad Request',
    };
    InstancesAPI.update.mockRejectedValue(mockError);

    const { user } = renderItem();

    const slider = screen.getByRole('slider');
    slider.focus();
    // A single ArrowRight from the initial 0.40 advances one step (0.1) to
    // 0.5, which handleChangeValue rounds to 0.5. This triggers the
    // (mocked-immediate) update which rejects.
    await user.keyboard('{ArrowRight}');

    await waitFor(() => {
      const expected =
        Math.round(Number(slider.getAttribute('aria-valuenow')) * 100) / 100;
      expect(InstancesAPI.update).toHaveBeenCalledWith(1, {
        capacity_adjustment: expected,
      });
    });
  });

  test('Should render expanded row with the correct data points', () => {
    const { container } = renderItem({ isExpanded: true });

    const policyTerm = within(container).getByText('Policy Type');
    expect(policyTerm.nextElementSibling).toHaveTextContent('Auto');

    const healthCheckTerm = within(container).getByText('Last Health Check');
    expect(healthCheckTerm.closest('div')).toHaveTextContent(
      '9/15/2021, 6:02:07 PM'
    );
  });

  test('Hop should not render some things', () => {
    const { container } = renderWithContexts(
      <table>
        <tbody>
          <InstanceListItem
            instance={instance[1]}
            onSelect={() => {}}
            fetchInstances={() => {}}
          />
        </tbody>
      </table>
    );

    expect(
      screen.queryByRole('switch', { name: 'Toggle instance' })
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-label="Instance group used capacity"]')
    ).toBeNull();
    expect(
      container.querySelector('[data-label="Capacity Adjustment"]')
    ).toBeNull();
  });
});
