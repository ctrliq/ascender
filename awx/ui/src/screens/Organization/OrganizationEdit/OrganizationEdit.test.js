import React from 'react';
import { act } from 'react-dom/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { OrganizationsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import OrganizationEdit from './OrganizationEdit';

jest.mock('../../../api');

// Drive only OrganizationEdit's handleSubmit/handleCancel; the form's own
// fields are covered by OrganizationForm's suite.
let formProps;
jest.mock('../shared/OrganizationForm', () => {
  const MockOrganizationForm = (props) => {
    formProps = props;
    return (
      <div data-testid="organization-form">
        <button
          type="button"
          aria-label="Save"
          onClick={() => props.onSubmit({}, [], [])}
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

describe('<OrganizationEdit />', () => {
  const mockData = {
    name: 'Foo',
    description: 'Bar',
    id: 1,
    related: {
      instance_groups: '/api/v2/organizations/1/instance_groups',
    },
    default_environment: 1,
    summary_fields: {
      default_environment: {
        id: 1,
        name: 'Baz',
        image: 'quay.io/ansible/awx-ee',
      },
    },
  };

  afterEach(() => {
    jest.clearAllMocks();
    formProps = undefined;
  });

  test('onSubmit should call api update', async () => {
    renderWithContexts(<OrganizationEdit organization={mockData} />);
    await screen.findByTestId('organization-form');

    const updatedOrgData = {
      name: 'new name',
      description: 'new description',
      default_environment: null,
    };
    await act(async () => {
      formProps.onSubmit(updatedOrgData, [], []);
    });

    expect(OrganizationsAPI.update).toHaveBeenCalledWith(1, updatedOrgData);
  });

  test('onSubmit associates and disassociates instance groups', async () => {
    renderWithContexts(<OrganizationEdit organization={mockData} />);
    await screen.findByTestId('organization-form');

    const updatedOrgData = {
      name: 'new name',
      description: 'new description',
    };
    const newInstanceGroups = [
      {
        name: 'mock three',
        id: 3,
      },
      {
        name: 'mock four',
        id: 4,
      },
    ];
    const oldInstanceGroups = [
      {
        name: 'mock two',
        id: 2,
      },
    ];

    await act(async () => {
      formProps.onSubmit(updatedOrgData, newInstanceGroups, oldInstanceGroups);
    });

    expect(OrganizationsAPI.orderInstanceGroups).toHaveBeenCalledWith(
      mockData.id,
      newInstanceGroups,
      oldInstanceGroups
    );
  });

  test('should navigate to organization detail when cancel is clicked', async () => {
    const mockInstanceGroups = [
      { name: 'One', id: 1 },
      { name: 'Two', id: 2 },
    ];
    OrganizationsAPI.readInstanceGroups.mockReturnValue({
      data: {
        results: mockInstanceGroups,
      },
    });
    const history = createMemoryHistory({});
    const { user } = renderWithContexts(
      <OrganizationEdit organization={mockData} />,
      { context: { router: { history } } }
    );
    await screen.findByTestId('organization-form');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(history.location.pathname).toEqual('/organizations/1/details');
  });
});
