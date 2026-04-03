import React from 'react';
import { mountWithContexts } from '../../../testUtils/enzymeHelpers';

import ExecutionEnvironmentDetail from './ExecutionEnvironmentDetail';

const mockExecutionEnvironment = {
  id: 2,
  name: 'Foo',
  image: 'quay.io/ansible/awx-ee',
  pull: 'missing',
  description: '',
};

describe('<ExecutionEnvironmentDetail/>', () => {
  test('should display execution environment detail', async () => {
    const wrapper = mountWithContexts(
      <ExecutionEnvironmentDetail
        executionEnvironment={mockExecutionEnvironment}
      />
    );
    const executionEnvironment = wrapper.find('ExecutionEnvironmentDetail');
    expect(executionEnvironment).toHaveLength(1);
    expect(executionEnvironment.find('dt').text()).toEqual(
      'Execution Environment'
    );
    expect(executionEnvironment.find('dd').text()).toEqual(
      mockExecutionEnvironment.name
    );
  });

  test('should display warning deleted execution environment', async () => {
    const wrapper = mountWithContexts(
      <ExecutionEnvironmentDetail verifyMissingVirtualEnv={false} />
    );
    const executionEnvironment = wrapper.find('ExecutionEnvironmentDetail');
    expect(executionEnvironment).toHaveLength(1);
    expect(executionEnvironment.find('dt').text()).toEqual(
      'Execution Environment'
    );
    expect(executionEnvironment.find('dd').text()).toEqual('Missing resource');
    expect(wrapper.find('Tooltip').prop('content')).toEqual(
      `Execution environment is missing or deleted.`
    );
  });
});
