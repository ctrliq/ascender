import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';

import { OrganizationsAPI, CredentialsAPI } from 'api';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';

import OrganizationDetail from './OrganizationDetail';

jest.mock('../../../api');

describe('<OrganizationDetail />', () => {
  const mockOrganization = {
    id: 12,
    name: 'Foo',
    description: 'Bar',
    max_hosts: '0',
    created: '2015-07-07T17:21:26.429745Z',
    modified: '2019-08-11T19:47:37.980466Z',
    summary_fields: {
      user_capabilities: {
        edit: true,
        delete: true,
      },
      default_environment: {
        id: 1,
        name: 'Default EE',
        description: '',
        image: 'quay.io/ansible/awx-ee',
      },
    },
    default_environment: 1,
  };
  const mockInstanceGroups = {
    data: {
      results: [
        { name: 'One', id: 1 },
        { name: 'Two', id: 2 },
      ],
    },
  };

  beforeEach(() => {
    CredentialsAPI.read.mockResolvedValue({ data: { count: 0 } });

    OrganizationsAPI.readInstanceGroups.mockResolvedValue(mockInstanceGroups);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    renderWithContexts(<OrganizationDetail organization={mockOrganization} />);
    expect(await screen.findByText('Name')).toBeInTheDocument();
  });

  test('should request instance groups from api', async () => {
    renderWithContexts(<OrganizationDetail organization={mockOrganization} />);
    await screen.findByText('Name');
    expect(OrganizationsAPI.readInstanceGroups).toHaveBeenCalledTimes(1);
  });

  test('should build the proper number of delete detail requests', () => {
    const deleteDetailsRequests =
      relatedResourceDeleteRequests((str) => str).organization(mockOrganization);
    expect(deleteDetailsRequests).toHaveLength(7);
  });

  test('should render the expected instance group', async () => {
    renderWithContexts(<OrganizationDetail organization={mockOrganization} />);
    expect(await screen.findByText('One')).toBeInTheDocument();
    expect(screen.getByText('Two')).toBeInTheDocument();
  });

  test('should render Details', async () => {
    renderWithContexts(<OrganizationDetail organization={mockOrganization} />);
    await screen.findByText('Name');

    assertDetail('Name', 'Foo');
    assertDetail('Description', 'Bar');
    assertDetail('Created', '7/7/2015, 5:21:26 PM');
    assertDetail('Last Modified', '8/11/2019, 7:47:37 PM');
    assertDetail('Max Hosts', '0');
    assertDetail('Default Execution Environment', 'Default EE');
  });

  test('should show edit button for users with edit permission', async () => {
    // the Edit link is built from the route :id param, so render under a
    // matching route with the organization id in the path
    const history = createMemoryHistory({
      initialEntries: ['/organizations/12/details'],
    });
    renderWithContexts(
      <Routes>
        <Route
          path="/organizations/:id/details"
          element={<OrganizationDetail organization={mockOrganization} />}
        />
      </Routes>,
      { context: { router: { history } } }
    );
    const editButton = await screen.findByRole('link', { name: 'Edit' });
    expect(editButton).toHaveTextContent('Edit');
    expect(editButton).toHaveAttribute('href', '/organizations/12/edit');
  });

  test('should hide edit button for users without edit permission', async () => {
    const readOnlyOrg = {
      ...mockOrganization,
      summary_fields: {
        ...mockOrganization.summary_fields,
        user_capabilities: {
          ...mockOrganization.summary_fields.user_capabilities,
          edit: false,
        },
      },
    };

    renderWithContexts(<OrganizationDetail organization={readOnlyOrg} />);
    await screen.findByText('Name');
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });

  test('expected api calls are made for delete', async () => {
    OrganizationsAPI.readInstanceGroups.mockResolvedValue({ data: {} });
    OrganizationsAPI.destroy.mockResolvedValueOnce({});

    const { user } = renderWithContexts(
      <OrganizationDetail organization={mockOrganization} />
    );

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );

    await waitFor(() => expect(OrganizationsAPI.destroy).toHaveBeenCalledTimes(1));
  });

  test('should show content error for failed instance group fetch', async () => {
    OrganizationsAPI.readInstanceGroups.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );

    renderWithContexts(<OrganizationDetail organization={mockOrganization} />);
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('Error dialog shown for failed deletion', async () => {
    OrganizationsAPI.destroy.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );

    const { user } = renderWithContexts(
      <OrganizationDetail organization={mockOrganization} />
    );

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
  });

  test('should not load instance groups', async () => {
    OrganizationsAPI.readInstanceGroups.mockResolvedValue({
      data: {
        results: [],
      },
    });

    renderWithContexts(<OrganizationDetail organization={mockOrganization} />);
    await screen.findByText('Name');
    // an empty Instance Groups detail is not rendered at all
    expect(screen.queryByText('Instance Groups')).not.toBeInTheDocument();
  });

  test('should not load galaxy credentials', async () => {
    OrganizationsAPI.readInstanceGroups.mockResolvedValue({ data: {} });

    renderWithContexts(
      <OrganizationDetail
        organization={{
          ...mockOrganization,
          galaxy_credentials: [],
        }}
      />
    );
    await screen.findByText('Name');
    // an empty Galaxy Credentials detail is not rendered at all
    expect(screen.queryByText('Galaxy Credentials')).not.toBeInTheDocument();
  });
});
