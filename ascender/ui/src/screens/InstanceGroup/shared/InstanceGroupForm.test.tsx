import type { Mock } from 'vitest';
import type { InstanceGroup } from 'types/api';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import InstanceGroupForm from './InstanceGroupForm';

vi.mock('../../../api');

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
  let onCancel: Mock;
  let onSubmit: Mock;

  beforeEach(() => {
    onCancel = vi.fn();
    onSubmit = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function setup(
    overrides: Record<string, unknown> = {},
    queueNames?: { controlPlane: string; execution: string }
  ) {
    return renderWithContexts(
      <InstanceGroupForm
        queueNames={queueNames}
        onCancel={onCancel}
        onSubmit={onSubmit}
        instanceGroup={
          {
            ...instanceGroup,
            ...overrides,
          } as unknown as Partial<InstanceGroup>
        }
      />
    );
  }

  /*
   * The api refuses to rename the installer's groups or to move their policy
   * instance percentage, so the form holds both fields and says why.
   */
  test.each([['default'], ['controlplane']])(
    'holds the name and percentage of %s and says why',
    (name) => {
      const { container } = setup({ name });
      expect(container.querySelector('#instance-group-name')).toBeDisabled();
      expect(
        container.querySelector('#instance-group-policy-instance-percentage')
      ).toBeDisabled();
      expect(
        container.querySelector('#instance-group-policy-instance-minimum')
      ).toBeEnabled();
      expect(
        screen.getByText(
          `The ${name} instance group's name may not be changed.`
        )
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          `The ${name} instance group's policy instance percentage may not be changed from the initial value set by the installer.`
        )
      ).toBeInTheDocument();
    }
  );

  // The api protects the groups its settings name, which an install may
  // name otherwise than the defaults.
  test('holds the groups under the names the install gives them', () => {
    const names = { controlPlane: 'cp', execution: 'jobs' };
    const { container, unmount } = setup({ name: 'cp' }, names);
    expect(container.querySelector('#instance-group-name')).toBeDisabled();
    unmount();

    const other = setup({ name: 'controlplane' }, names);
    expect(other.container.querySelector('#instance-group-name')).toBeEnabled();
  });

  test('leaves the name and percentage of any other group editable', () => {
    const { container } = setup();
    expect(container.querySelector('#instance-group-name')).toBeEnabled();
    expect(
      container.querySelector('#instance-group-policy-instance-percentage')
    ).toBeEnabled();
  });

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

    await user.clear(nameInput!);
    await user.type(nameInput!, 'Foo');
    await user.clear(minInput!);
    await user.type(minInput!, '10');

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
