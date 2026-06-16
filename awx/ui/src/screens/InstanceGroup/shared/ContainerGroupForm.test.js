import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { CredentialsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ContainerGroupForm from './ContainerGroupForm';

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
  credential: 3,
  policy_instance_percentage: 46,
  policy_instance_minimum: 12,
  policy_instance_list: [],
  pod_spec_override: '',
  summary_fields: {
    credential: {
      id: 3,
      name: 'test',
      description: 'Simple one',
      kind: 'kubernetes_bearer_token',
      cloud: false,
      kubernetes: true,
      credential_type_id: 17,
    },
    user_capabilities: {
      edit: true,
      delete: true,
    },
  },
};

const initialPodSpec = {
  default: {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      namespace: 'default',
    },
    spec: {
      containers: [
        {
          image: 'ansible/ansible-runner',
          tty: true,
          stdin: true,
          imagePullPolicy: 'Always',
          args: ['sleep', 'infinity'],
        },
      ],
    },
  },
};

describe('<ContainerGroupForm/>', () => {
  let onCancel;
  let onSubmit;

  beforeEach(() => {
    onCancel = jest.fn();
    onSubmit = jest.fn();
    CredentialsAPI.read.mockResolvedValue({
      data: { count: 0, results: [] },
    });
    CredentialsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function setup() {
    return renderWithContexts(
      <ContainerGroupForm
        onCancel={onCancel}
        onSubmit={onSubmit}
        instanceGroup={instanceGroup}
        initialPodSpec={initialPodSpec}
      />
    );
  }

  test('should display form fields properly', async () => {
    const { container } = setup();
    // FormField labelIcon Popovers break getByLabelText; query inputs by id.
    expect(container.querySelector('#container-group-name')).toHaveValue('Bar');
    // The "Customize pod specification" checkbox starts unchecked, so the
    // pod-spec CodeEditor section is not rendered.
    const overrideCheckbox = container.querySelector(
      '#container-groups-override-pod-specification'
    );
    expect(overrideCheckbox).not.toBeChecked();
    expect(screen.queryByText('Custom pod spec')).not.toBeInTheDocument();
    // The CredentialLookup pre-fills the credential name from summary_fields.
    // findBy awaits the lookup's async credential fetch settling.
    expect(
      await screen.findByRole('textbox', { name: /Credential/i })
    ).toHaveValue('test');
  });

  test('checking customize pod specification reveals the pod spec editor', async () => {
    const { user, container } = setup();
    const overrideCheckbox = container.querySelector(
      '#container-groups-override-pod-specification'
    );
    await user.click(overrideCheckbox);
    expect(overrideCheckbox).toBeChecked();
    // react-ace renders empty under jsdom, so assert the surrounding label.
    expect(await screen.findByText('Custom pod spec')).toBeInTheDocument();
  });

  test('should update form values', async () => {
    const { user, container } = setup();
    const nameInput = container.querySelector('#container-group-name');
    await user.clear(nameInput);
    await user.type(nameInput, 'new Foo');
    expect(nameInput).toHaveValue('new Foo');
  });

  test('should call onSubmit when form submitted', async () => {
    const { user } = setup();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  test('should call handleCancel when Cancel button is clicked', async () => {
    const { user } = setup();
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
