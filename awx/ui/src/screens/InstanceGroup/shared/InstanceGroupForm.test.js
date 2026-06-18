import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import InstanceGroupForm from './InstanceGroupForm';

jest.mock('../../../api');

const instanceGroup = {
  id: 7,
  type: 'instance_group',
  url: '/api/v2/instance_groups/7/',
  related: {
    jobs: '/api/v2/instance_groups/7/jobs/',
    instances: '/api/v2/instance_groups/7/instances/',
  },
  name: 'Bar',
  created: '2020-07-21T18:41:02.818081Z',
  modified: '2020-07-24T20:32:03.121079Z',
  capacity: 24,
  committed_capacity: 0,
  consumed_capacity: 0,
  percent_capacity_remaining: 100.0,
  jobs_running: 0,
  jobs_total: 0,
  instances: 1,
  controller: null,
  is_container_group: false,
  credential: null,
  policy_instance_percentage: 46,
  policy_instance_minimum: 12,
  policy_instance_list: [],
  pod_spec_override: '',
  summary_fields: {
    user_capabilities: {
      edit: true,
      delete: true,
    },
  },
};

describe('<InstanceGroupForm/>', () => {
  let onCancel;
  let onSubmit;

  beforeEach(() => {
    onCancel = jest.fn();
    onSubmit = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function setup() {
    return renderWithContexts(
      <InstanceGroupForm
        onCancel={onCancel}
        onSubmit={onSubmit}
        instanceGroup={instanceGroup}
      />
    );
  }

  test('should display form fields properly', () => {
    const { container } = setup();
    // FormField labelIcon Popovers break getByLabelText, so query inputs by id.
    expect(container.querySelector('#instance-group-name')).toBeInTheDocument();
    expect(
      container.querySelector('#instance-group-policy-instance-minimum')
    ).toBeInTheDocument();
    expect(
      container.querySelector('#instance-group-policy-instance-percentage')
    ).toBeInTheDocument();
  });

  test('should call onSubmit when form submitted', async () => {
    const { user } = setup();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  test('should update form values', async () => {
    const { user, container } = setup();
    const nameInput = container.querySelector('#instance-group-name');
    const minInput = container.querySelector(
      '#instance-group-policy-instance-minimum'
    );

    await user.clear(nameInput);
    await user.type(nameInput, 'Foo');
    await user.clear(minInput);
    await user.type(minInput, '10');

    expect(nameInput).toHaveValue('Foo');
    expect(minInput).toHaveValue(10);
    expect(
      container.querySelector('#instance-group-policy-instance-percentage')
    ).toHaveValue(46);
  });

  test('should call handleCancel when Cancel button is clicked', async () => {
    const { user } = setup();
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
