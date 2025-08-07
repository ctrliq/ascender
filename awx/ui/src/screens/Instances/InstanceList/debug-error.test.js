import React from 'react';
import { act } from 'react-dom/test-utils';
import { InstancesAPI } from 'api';
import useDebounce from 'hooks/useDebounce';
import { mountWithContexts } from '../../../../testUtils/enzymeHelpers';
import InstanceListItem from './InstanceListItem';

jest.mock('../../../api');
jest.mock('../../../hooks/useDebounce');

const instance = {
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
};

describe('Debug error display', () => {
  let wrapper;

  beforeEach(() => {
    useDebounce.mockImplementation((fn) => fn);
  });

  test('should debug error display', async () => {
    jest.useFakeTimers();
    
    // Mock the API to reject
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

    // Mount the component
    await act(async () => {
      wrapper = mountWithContexts(
        <table>
          <tbody>
            <InstanceListItem
              instance={instance}
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

    console.log('Initial ErrorDetail count:', wrapper.find('ErrorDetail').length);
    console.log('Initial AlertModal count:', wrapper.find('AlertModal').length);

    // Trigger the slider change
    await act(async () => {
      console.log('Triggering slider onChange');
      wrapper.find('Slider').prop('onChange')(0.30001);
    });

    await act(async () => {
      wrapper.update();
    });

    console.log('After slider change - ErrorDetail count:', wrapper.find('ErrorDetail').length);
    console.log('After slider change - AlertModal count:', wrapper.find('AlertModal').length);
    console.log('InstancesAPI.update call count:', InstancesAPI.update.mock.calls.length);

    // Advance timers
    jest.advanceTimersByTime(210);
    
    await act(async () => {
      wrapper.update();
    });

    console.log('After timer advance - ErrorDetail count:', wrapper.find('ErrorDetail').length);
    console.log('After timer advance - AlertModal count:', wrapper.find('AlertModal').length);
    console.log('InstancesAPI.update call count:', InstancesAPI.update.mock.calls.length);
    
    // Check the AlertModal children to understand the error structure
    if (wrapper.find('AlertModal').length > 0) {
      const errorDetailElement = wrapper.find('AlertModal').prop('children')[1];
      if (errorDetailElement && errorDetailElement.props) {
        console.log('ErrorDetail props error:', errorDetailElement.props.error);
        console.log('Error has response property:', Object.prototype.hasOwnProperty.call(errorDetailElement.props.error, 'response'));
        console.log('Error keys:', Object.keys(errorDetailElement.props.error));
        console.log('Error message:', errorDetailElement.props.error.message);
        console.log('Error response:', errorDetailElement.props.error.response);
      }
    }
    
    // Try to find ExpandableSection which is what ErrorDetail renders
    console.log('ExpandableSection count:', wrapper.find('ExpandableSection').length);

    expect(wrapper.find('InstanceListItem').length).toBe(1);
  });
});
