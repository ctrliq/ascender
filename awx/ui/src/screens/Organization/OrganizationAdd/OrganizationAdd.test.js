import React from 'react';
import { act } from 'react-dom/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { CredentialsAPI, OrganizationsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import OrganizationAdd from './OrganizationAdd';

jest.mock('../../../api');

// The shared OrganizationForm carries galaxy-credential and instance-group
// lookups that are exercised by OrganizationForm's own suite; here we only
// need to drive its onSubmit/onCancel callbacks, so capture the latest props.
let formProps;
jest.mock('../shared/OrganizationForm', () => {
  const MockOrganizationForm = (props) => {
    formProps = props;
    return (
      <div data-testid="organization-form">
        <button
          type="button"
          aria-label="Save"
          onClick={() => props.onSubmit({}, [])}
        >
          Save
        </button>
        <button type="button" aria-label="Cancel" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    );
  };
  return MockOrganizationForm;
});

describe('<OrganizationAdd />', () => {
  beforeEach(() => {
    CredentialsAPI.read.mockResolvedValue({
      data: {
        results: [
          {
            id: 2,
            type: 'credential',
            name: 'Ansible Galaxy',
            credential_type: 18,
            managed: true,
            kind: 'galaxy_api_token',
          },
        ],
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    formProps = undefined;
  });

  test('onSubmit should post to api', async () => {
    const updatedOrgData = {
      name: 'new name',
      description: 'new description',
      galaxy_credentials: [],
      default_environment: { id: 1, name: 'Foo' },
    };
    OrganizationsAPI.create.mockResolvedValueOnce({ data: {} });
    renderWithContexts(<OrganizationAdd />);
    await screen.findByTestId('organization-form');

    await act(async () => {
      formProps.onSubmit(updatedOrgData, []);
    });

    expect(OrganizationsAPI.create).toHaveBeenCalledWith({
      ...updatedOrgData,
      default_environment: 1,
    });
    expect(OrganizationsAPI.create).toHaveBeenCalledTimes(1);
  });

  test('should navigate to organizations list when cancel is clicked', async () => {
    const history = createMemoryHistory({});
    const { user } = renderWithContexts(<OrganizationAdd />, {
      context: { router: { history } },
    });
    await screen.findByTestId('organization-form');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(history.location.pathname).toEqual('/organizations');
  });

  test('successful form submission should trigger redirect', async () => {
    const history = createMemoryHistory({});
    const orgData = {
      name: 'new name',
      description: 'new description',
      galaxy_credentials: [],
    };
    OrganizationsAPI.create.mockResolvedValueOnce({
      data: {
        id: 5,
        related: {
          instance_groups: '/bar',
        },
        ...orgData,
      },
    });
    renderWithContexts(<OrganizationAdd />, {
      context: { router: { history } },
    });
    await screen.findByTestId('organization-form');

    await act(async () => {
      await formProps.onSubmit(orgData, [{ id: 3 }]);
    });

    expect(history.location.pathname).toEqual('/organizations/5');
  });

  test('onSubmit should post instance groups', async () => {
    const orgData = {
      name: 'new name',
      description: 'new description',
      galaxy_credentials: [],
    };
    const mockInstanceGroups = [
      {
        name: 'mock ig',
        id: 3,
      },
    ];
    OrganizationsAPI.create.mockResolvedValueOnce({
      data: {
        id: 5,
        related: {
          instance_groups: '/api/v2/organizations/5/instance_groups',
        },
        ...orgData,
      },
    });
    renderWithContexts(<OrganizationAdd />);
    await screen.findByTestId('organization-form');

    await act(async () => {
      await formProps.onSubmit(orgData, mockInstanceGroups);
    });

    expect(OrganizationsAPI.associateInstanceGroup).toHaveBeenCalledWith(5, 3);
  });

  test('onSubmit should post galaxy credentials', async () => {
    const orgData = {
      name: 'new name',
      description: 'new description',
      galaxy_credentials: [
        {
          id: 9000,
        },
      ],
    };
    OrganizationsAPI.create.mockResolvedValueOnce({
      data: {
        id: 5,
        related: {
          instance_groups: '/api/v2/organizations/5/instance_groups',
        },
        ...orgData,
      },
    });
    renderWithContexts(<OrganizationAdd />);
    await screen.findByTestId('organization-form');

    await act(async () => {
      await formProps.onSubmit(orgData, [{ id: 3 }]);
    });

    expect(OrganizationsAPI.associateGalaxyCredential).toHaveBeenCalledWith(
      5,
      9000
    );
  });
});
