import type { Mock } from 'vitest';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { CredentialsAPI, InstancesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ContainerGroupForm from './ContainerGroupForm';

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
  let onCancel: Mock;
  let onSubmit: Mock;

  beforeEach(() => {
    onCancel = vi.fn();
    onSubmit = vi.fn();
    vi.mocked(CredentialsAPI.read).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof CredentialsAPI.read>);
    vi.mocked(CredentialsAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof CredentialsAPI.readOptions>);
    vi.mocked(InstancesAPI.read).mockResolvedValue({
      data: {
        count: 1,
        results: [{ id: 5, hostname: 'receptor.remote', node_type: 'hop' }],
      },
    } as unknown as ResponseOf<typeof InstancesAPI.read>);
    vi.mocked(InstancesAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    } as unknown as ResponseOf<typeof InstancesAPI.readOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
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
    // The "Override Pod Spec" checkbox starts unchecked, so the
    // pod-spec CodeEditor section is not rendered.
    const overrideCheckbox = container.querySelector(
      '#container-groups-override-pod-specification'
    );
    expect(overrideCheckbox).not.toBeChecked();
    expect(screen.queryByText('Pod Spec Override')).not.toBeInTheDocument();
    // The CredentialLookup pre-fills the credential name from summary_fields.
    // findBy awaits the lookup's async credential fetch settling.
    expect(
      await screen.findByRole('textbox', { name: /Credential/i })
    ).toHaveValue('test');
  });

  test('checking override pod spec reveals the pod spec editor', async () => {
    const { user, container } = setup();
    const overrideCheckbox = container.querySelector(
      '#container-groups-override-pod-specification'
    );
    await user.click(overrideCheckbox!);
    expect(overrideCheckbox).toBeChecked();
    expect(await screen.findByText('Pod Spec Override')).toBeInTheDocument();
  });

  test('should update form values', async () => {
    const { user, container } = setup();
    const nameInput = container.querySelector('#container-group-name');
    await user.clear(nameInput!);
    await user.type(nameInput!, 'new Foo');
    expect(nameInput).toHaveValue('new Foo');
  });

  test('should call onSubmit when form submitted', async () => {
    const { user } = setup();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  test('picking a mesh node drops the credential', async () => {
    const { user } = setup();
    const meshNode = await screen.findByRole('textbox', { name: /Mesh node/i });
    await user.type(meshNode, 'receptor.remote');

    await waitFor(() =>
      expect(InstancesAPI.read).toHaveBeenCalledWith({
        node_type: 'hop',
        hostname: 'receptor.remote',
      })
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: /Credential/i })
      ).not.toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          credential: null,
          mesh_node: expect.objectContaining({
            id: 5,
            name: 'receptor.remote',
          }),
        })
      )
    );
  });

  test('a group behind a mesh node shows it by hostname', async () => {
    renderWithContexts(
      <ContainerGroupForm
        onCancel={onCancel}
        onSubmit={onSubmit}
        instanceGroup={{
          ...instanceGroup,
          credential: null,
          mesh_node: 5,
          summary_fields: {
            ...instanceGroup.summary_fields,
            credential: undefined,
            mesh_node: {
              id: 5,
              hostname: 'receptor.remote',
              node_state: 'ready',
            },
          },
        }}
        initialPodSpec={initialPodSpec}
      />
    );
    expect(
      await screen.findByRole('textbox', { name: /Mesh node/i })
    ).toHaveValue('receptor.remote');
    expect(
      screen.queryByRole('textbox', { name: /Credential/i })
    ).not.toBeInTheDocument();
  });

  test('should call handleCancel when Cancel button is clicked', async () => {
    const { user } = setup();
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
