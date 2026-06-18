import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { OrganizationsAPI, ExecutionEnvironmentsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import OrganizationForm from './OrganizationForm';

jest.mock('../../../api');

// The lookups have their own modal-driven suites; here we stub them so the
// form's wiring (chips from value, onChange -> onSubmit args) can be driven
// deterministically.
jest.mock('components/Lookup', () => {
  const actual = jest.requireActual('components/Lookup');
  return {
    ...actual,
    InstanceGroupsLookup: ({ value, onChange }) => (
      <div data-testid="instance-groups-lookup">
        {(value || []).map((ig) => (
          <span key={ig.id} data-testid="instance-group-chip">
            {ig.name}
          </span>
        ))}
        <button
          type="button"
          aria-label="add-instance-groups"
          onClick={() =>
            onChange(
              [
                { name: 'One', id: 1 },
                { name: 'Three', id: 3 },
              ],
              'instanceGroups'
            )
          }
        >
          add-instance-groups
        </button>
      </div>
    ),
    ExecutionEnvironmentLookup: ({ value, onChange }) => (
      <div data-testid="execution-environment-lookup">
        {value ? <span>{value.name}</span> : null}
        <button
          type="button"
          aria-label="select-ee"
          onClick={() => onChange({ id: 1, name: 'Test EE' })}
        >
          select-ee
        </button>
      </div>
    ),
  };
});

jest.mock('components/Lookup/CredentialLookup', () => ({ value }) => (
  <div data-testid="credential-lookup">
    {(Array.isArray(value) ? value : [value].filter(Boolean)).map((cred) => (
      <span key={cred.id} data-testid="galaxy-credential-chip">
        {cred.name}
      </span>
    ))}
  </div>
));

describe('<OrganizationForm />', () => {
  const mockData = {
    id: 1,
    name: 'Foo',
    description: 'Bar',
    max_hosts: 1,
    related: {
      instance_groups: '/api/v2/organizations/1/instance_groups',
    },
  };
  const mockInstanceGroups = [
    { name: 'One', id: 1 },
    { name: 'Two', id: 2 },
  ];

  const mockExecutionEnvironment = [
    { id: 1, name: 'EE', image: 'quay.io/ansible/awx-ee' },
  ];

  beforeEach(() => {
    OrganizationsAPI.readInstanceGroups.mockResolvedValue({
      data: {
        results: mockInstanceGroups,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render default galaxy credential when passed', async () => {
    renderWithContexts(
      <OrganizationForm
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        defaultGalaxyCredential={{
          id: 2,
          type: 'credential',
          name: 'Ansible Galaxy',
          credential_type: 18,
          managed: true,
          kind: 'galaxy_api_token',
        }}
      />
    );
    expect(
      await screen.findByTestId('credential-lookup')
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('galaxy-credential-chip')).toHaveLength(1);
  });

  test('should request related instance groups from api', async () => {
    renderWithContexts(
      <OrganizationForm
        organization={mockData}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    await screen.findByTestId('instance-groups-lookup');
    expect(OrganizationsAPI.readInstanceGroups).toHaveBeenCalledTimes(1);
  });

  test('componentDidMount should set instanceGroups to state', async () => {
    renderWithContexts(
      <OrganizationForm
        organization={mockData}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    await screen.findByTestId('instance-groups-lookup');
    expect(OrganizationsAPI.readInstanceGroups).toHaveBeenCalled();
    expect(screen.getAllByTestId('instance-group-chip')).toHaveLength(2);
  });

  test('Instance group is rendered when added', async () => {
    OrganizationsAPI.readInstanceGroups.mockResolvedValue({
      data: { results: [] },
    });
    const { user } = renderWithContexts(
      <OrganizationForm
        organization={mockData}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    await screen.findByTestId('instance-groups-lookup');
    expect(screen.queryAllByTestId('instance-group-chip')).toHaveLength(0);

    await user.click(
      screen.getByRole('button', { name: 'add-instance-groups' })
    );

    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.getByText('Three')).toBeInTheDocument();
  });

  test('changing inputs and saving triggers expected callback', async () => {
    ExecutionEnvironmentsAPI.read.mockResolvedValue({
      data: {
        results: mockExecutionEnvironment,
      },
    });
    const onSubmit = jest.fn();
    const { user, container } = renderWithContexts(
      <OrganizationForm
        organization={mockData}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />
    );
    await screen.findByTestId('instance-groups-lookup');

    const nameInput = container.querySelector('#org-name');
    const descriptionInput = container.querySelector('#org-description');
    const maxHostsInput = container.querySelector('#org-max_hosts');

    await user.clear(nameInput);
    await user.type(nameInput, 'new foo');
    await user.clear(descriptionInput);
    await user.type(descriptionInput, 'new bar');
    await user.clear(maxHostsInput);
    await user.type(maxHostsInput, '134');
    await user.click(screen.getByRole('button', { name: 'select-ee' }));

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({
      name: 'new foo',
      description: 'new bar',
      galaxy_credentials: [],
      max_hosts: 134,
      default_environment: { id: 1, name: 'Test EE' },
    });
  });

  test('onSubmit associates and disassociates instance groups', async () => {
    ExecutionEnvironmentsAPI.read.mockResolvedValue({
      data: { results: mockExecutionEnvironment },
    });
    const mockDataForm = {
      name: 'Foo',
      description: 'Bar',
      galaxy_credentials: [],
      max_hosts: 1,
      default_environment: null,
    };
    const onSubmit = jest.fn();
    OrganizationsAPI.update.mockResolvedValue(1);
    OrganizationsAPI.associateInstanceGroup.mockResolvedValue('done');
    OrganizationsAPI.disassociateInstanceGroup.mockResolvedValue('done');
    const { user } = renderWithContexts(
      <OrganizationForm
        organization={mockData}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />
    );
    await screen.findByTestId('instance-groups-lookup');

    await user.click(
      screen.getByRole('button', { name: 'add-instance-groups' })
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        mockDataForm,
        [
          { name: 'One', id: 1 },
          { name: 'Three', id: 3 },
        ],
        mockInstanceGroups
      )
    );
  });

  test('onSubmit does not get called if max_hosts value is out of range', async () => {
    const onSubmit = jest.fn();
    // mount with negative value
    const mockDataNegative = JSON.parse(JSON.stringify(mockData));
    mockDataNegative.max_hosts = -5;
    const { user, unmount } = renderWithContexts(
      <OrganizationForm
        organization={mockDataNegative}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />
    );
    await screen.findByTestId('instance-groups-lookup');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
    unmount();

    // mount with out of range value
    const mockDataOutOfRange = JSON.parse(JSON.stringify(mockData));
    mockDataOutOfRange.max_hosts = 999999999999999999999;
    const { user: user2 } = renderWithContexts(
      <OrganizationForm
        organization={mockDataOutOfRange}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />
    );
    await screen.findByTestId('instance-groups-lookup');
    await user2.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('onSubmit is called and max_hosts value defaults to 0 if input is not a number', async () => {
    const onSubmit = jest.fn();
    // mount with String value (default to zero)
    const mockDataString = JSON.parse(JSON.stringify(mockData));
    mockDataString.max_hosts = 'Bee';
    const { user } = renderWithContexts(
      <OrganizationForm
        organization={mockDataString}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />
    );
    await screen.findByTestId('instance-groups-lookup');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        {
          name: 'Foo',
          description: 'Bar',
          galaxy_credentials: [],
          max_hosts: 0,
          default_environment: null,
        },
        mockInstanceGroups,
        mockInstanceGroups
      )
    );
  });

  test('calls "onCancel" when Cancel button is clicked', async () => {
    const onCancel = jest.fn();
    const { user } = renderWithContexts(
      <OrganizationForm
        organization={mockData}
        onSubmit={jest.fn()}
        onCancel={onCancel}
      />
    );
    await screen.findByTestId('instance-groups-lookup');
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
