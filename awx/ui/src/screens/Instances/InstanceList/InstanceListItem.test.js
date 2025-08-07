import React from 'react';
import { act } from 'react-dom/test-utils';

import { InstancesAPI } from 'api';
import useDebounce from 'hooks/useDebounce';
import { mountWithContexts } from '../../../../testUtils/enzymeHelpers';

import InstanceListItem from './InstanceListItem';

jest.mock('../../../api');
jest.mock('../../../hooks/useDebounce');

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({
    id: 1,
  }),
}));
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

describe('<InstanceListItem/>', () => {
  let wrapper;

  beforeEach(() => {
    useDebounce.mockImplementation((fn) => fn);
  });

  test('should mount successfully', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <table>
          <tbody>
            <InstanceListItem
              instance={instance[0]}
              isSelected={false}
              onSelect={() => {}}
              fetchInstances={() => {}}
            />
          </tbody>
        </table>
      );
    });
    expect(wrapper.find('InstanceListItem').length).toBe(1);
  });

  test('should calculate number of forks when slide changes', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <table>
          <tbody>
            <InstanceListItem
              instance={instance[0]}
              isSelected={false}
              onSelect={() => {}}
              fetchInstances={() => {}}
            />
          </tbody>
        </table>
      );
    });
    expect(wrapper.find('InstanceListItem').length).toBe(1);
    const forksText = wrapper.find('InstanceListItem__SliderForks').text();
    expect(forksText).toContain('10');
    expect(forksText).toContain('forks');

    await act(async () => {
      wrapper.find('Slider').prop('onChange')(1);
    });

    wrapper.update();
    const forksText24 = wrapper.find('InstanceListItem__SliderForks').text();
    expect(forksText24).toContain('24');
    expect(forksText24).toContain('forks');

    await act(async () => {
      wrapper.find('Slider').prop('onChange')(0);
    });
    wrapper.update();
    const forkText1 = wrapper.find('InstanceListItem__SliderForks').text();
    expect(forkText1).toContain('1');
    expect(forkText1).toContain('fork');

    await act(async () => {
      wrapper.find('Slider').prop('onChange')(0.5);
    });
    wrapper.update();
    const forksText12 = wrapper.find('InstanceListItem__SliderForks').text();
    expect(forksText12).toContain('12');
    expect(forksText12).toContain('forks');
  });

  test('should render the proper data instance', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <table>
          <tbody>
            <InstanceListItem
              instance={instance[0]}
              isSelected={false}
              onSelect={() => {}}
              fetchInstances={() => {}}
            />
          </tbody>
        </table>
      );
    });
    expect(wrapper.find('Td[dataLabel="Name"]').find('Link').prop('to')).toBe(
      '/instances/1/details'
    );
    expect(wrapper.find('Td').at(2).text()).toBe('awx');
    expect(wrapper.find('Progress').prop('value')).toBe(40);
    expect(
      wrapper
        .find('Td')
        .at(5)
        .containsMatchingElement(<div>CPU 24</div>)
    );
    expect(
      wrapper
        .find('Td')
        .at(5)
        .containsMatchingElement(<div>RAM 24</div>)
    );
    const forksTextData = wrapper.find('InstanceListItem__SliderForks').text();
    expect(forksTextData).toContain('10');
    expect(forksTextData).toContain('forks');
  });

  test('should render checkbox', async () => {
    const onSelect = jest.fn();
    await act(async () => {
      wrapper = mountWithContexts(
        <table>
          <tbody>
            <InstanceListItem
              instance={instance[0]}
              onSelect={onSelect}
              fetchInstances={() => {}}
            />
          </tbody>
        </table>
      );
    });
    expect(wrapper.find('Td').at(1).prop('select').onSelect).toEqual(onSelect);
  });

  test('should display instance toggle', () => {
    expect(wrapper.find('InstanceToggle').length).toBe(1);
  });

  test('should display error', async () => {
    jest.useFakeTimers();
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
    await act(async () => {
      wrapper = mountWithContexts(
        <table>
          <tbody>
            <InstanceListItem
              instance={instance[0]}
              isSelected={false}
              onSelect={() => {}}
              fetchInstances={() => {}}
            />
          </tbody>
        </table>,
        { context: { network: { handleHttpError: () => {} } } }
      );
    });
    await act(async () => {
      wrapper.update();
    });
    expect(wrapper.find('ErrorDetail').length).toBe(0);
    await act(async () => {
      wrapper.find('Slider').prop('onChange')(0.30001);
    });
    await act(async () => {
      wrapper.update();
    });
    jest.advanceTimersByTime(210);
    await act(async () => {
      wrapper.update();
    });
    // Verify that error handling triggers the AlertModal
    const alertModal = wrapper.find('AlertModal');
    expect(alertModal.length).toBe(1);
    expect(alertModal.prop('title')).toBe('Error!');
    expect(alertModal.prop('variant')).toBe('error');
    expect(alertModal.prop('onClose')).toBeDefined();
  });

  test('Should render expanded row with the correct data points', async () => {
    const onSelect = jest.fn();
    await act(async () => {
      wrapper = mountWithContexts(
        <table>
          <tbody>
            <InstanceListItem
              instance={instance[0]}
              onSelect={onSelect}
              fetchInstances={() => {}}
              isExpanded
            />
          </tbody>
        </table>
      );
    });
    expect(wrapper.find('InstanceListItem').prop('isExpanded')).toBe(true);

    expect(wrapper.find('Detail[label="Policy Type"]').prop('value')).toBe(
      'Auto'
    );
    expect(wrapper.find('Detail[label="Last Health Check"]').text()).toBe(
      'Last Health Check9/15/2021, 6:02:07 PM'
    );
  });
  test('Hop should not render some things', async () => {
    const onSelect = jest.fn();
    await act(async () => {
      wrapper = mountWithContexts(
        <table>
          <tbody>
            <InstanceListItem
              instance={instance[1]}
              onSelect={onSelect}
              fetchInstances={() => {}}
            />
          </tbody>
        </table>
      );
    });
    expect(wrapper.find('InstanceToggle').length).toBe(0);
    expect(
      wrapper.find("Td[dataLabel='Instance group used capacity']").length
    ).toBe(0);
    expect(wrapper.find("Td[dataLabel='Capacity Adjustment']").length).toBe(0);
  });
});
