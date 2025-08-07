import React from 'react';
import { act } from 'react-dom/test-utils';
import { mountWithContexts } from '../../../../testUtils/enzymeHelpers';
import InstanceListItem from './InstanceListItem';

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

describe('Debug InstanceListItem rendering', () => {
  test('should debug forks display', async () => {
    let wrapper;
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
        </table>
      );
    });
    
    console.log('SliderForks HTML:', wrapper.find('InstanceListItem__SliderForks').html());
    console.log('SliderForks text:', wrapper.find('InstanceListItem__SliderForks').text());
    console.log('All divs with number-forks:', wrapper.find('[data-cy="number-forks"]').text());
    console.log('Instance state:', wrapper.find('InstanceListItem').instance());
    
    // Try to access the component state/props directly
    const instanceItem = wrapper.find('InstanceListItem');
    console.log('InstanceListItem exists:', instanceItem.exists());
    
    expect(wrapper.find('InstanceListItem').length).toBe(1);
  });
});
