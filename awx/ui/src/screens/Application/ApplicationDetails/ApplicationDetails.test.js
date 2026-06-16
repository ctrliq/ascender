import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import { ApplicationsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import ApplicationDetails from './ApplicationDetails';

jest.mock('../../../api/models/Applications');

const authorizationOptions = [
  {
    key: 'authorization-code',
    label: 'Authorization code',
    value: 'authorization-code',
  },
  {
    key: 'password',
    label: 'Resource owner password-based',
    value: 'password',
  },
];

const clientTypeOptions = [
  { key: 'confidential', label: 'Confidential', value: 'confidential' },
  { key: 'public', label: 'Public', value: 'public' },
];

// fresh copy per test because some tests mutate user_capabilities
function buildApplication() {
  return {
    id: 10,
    type: 'o_auth2_application',
    url: '/api/v2/applications/10/',
    related: {
      named_url: '/api/v2/applications/Alex++bar/',
      tokens: '/api/v2/applications/10/tokens/',
      activity_stream: '/api/v2/applications/10/activity_stream/',
    },
    summary_fields: {
      organization: {
        id: 230,
        name: 'bar',
        description:
          'SaleNameBedPersonalityManagerWhileFinanceBreakToothPerson魲',
      },
      user_capabilities: {
        edit: true,
        delete: true,
      },
      tokens: {
        count: 2,
        results: [
          {
            id: 1,
            token: '************',
            scope: 'read',
          },
          {
            id: 2,
            token: '************',
            scope: 'write',
          },
        ],
      },
    },
    created: '2020-06-11T17:54:33.983993Z',
    modified: '2020-06-11T17:54:33.984039Z',
    name: 'Alex',
    description: 'foo',
    client_id: 'b1dmj8xzkbFm1ZQ27ygw2ZeE9I0AXqqeL74fiyk4',
    client_secret: '************',
    client_type: 'confidential',
    redirect_uris: 'http://www.google.com',
    authorization_grant_type: 'authorization-code',
    skip_authorization: false,
    organization: 230,
  };
}

function renderDetails(application, options) {
  return renderWithContexts(
    <ApplicationDetails
      application={application}
      authorizationOptions={authorizationOptions}
      clientTypeOptions={clientTypeOptions}
    />,
    options
  );
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('<ApplicationDetails/>', () => {
  test('should mount properly', () => {
    renderDetails(buildApplication());
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  test('should render proper data', () => {
    renderDetails(buildApplication());
    assertDetail('Name', 'Alex');
    assertDetail('Description', 'foo');
    assertDetail('Authorization grant type', 'Authorization code');
    assertDetail('Redirect URIs', 'http://www.google.com');
    assertDetail('Client type', 'Confidential');
    assertDetail('Client ID', 'b1dmj8xzkbFm1ZQ27ygw2ZeE9I0AXqqeL74fiyk4');

    const orgLink = screen.getByRole('link', { name: 'bar' });
    expect(orgLink).toHaveAttribute('href', '/organizations/230/details');

    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/applications/10/edit'
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  test('should delete properly', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/applications/1/details'],
    });
    const { user } = renderDetails(buildApplication(), {
      context: { router: { history } },
    });
    expect(history.location.pathname).toEqual('/applications/1/details');

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );

    await waitFor(() => expect(ApplicationsAPI.destroy).toHaveBeenCalledTimes(1));
    expect(ApplicationsAPI.destroy).toHaveBeenCalledWith(10);
    expect(history.location.pathname).toBe('/applications');
  });

  test('should not render delete button', () => {
    const application = buildApplication();
    application.summary_fields.user_capabilities.delete = false;
    renderDetails(application);
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
  });

  test('should not render edit button', () => {
    const application = buildApplication();
    application.summary_fields.user_capabilities.edit = false;
    renderDetails(application);
    expect(
      screen.queryByRole('link', { name: 'Edit' })
    ).not.toBeInTheDocument();
  });
});
