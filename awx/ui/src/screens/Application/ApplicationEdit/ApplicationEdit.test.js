import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { ApplicationsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ApplicationEdit from './ApplicationEdit';

jest.mock('../../../api/models/Applications');
jest.mock('../../../api/models/Organizations');

// The component reads useParams from react-router-dom (the route
// tree is v6); mock it there, keeping useNavigate real so the cancel/submit
// navigation assertions still exercise history.
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ id: 1 }),
}));

// The real form is exercised in ApplicationForm.test.js; here we mock it so the
// container's update/navigation/submit-error logic is what's tested.
jest.mock('../shared/ApplicationForm', () => function MockApplicationForm({
    onSubmit,
    onCancel,
    submitError,
  }) {
    return (
      <div>
        {submitError ? <div>FormSubmitError</div> : null}
        <button
          type="button"
          onClick={() =>
            onSubmit({
              authorization_grant_type: 'authorization-code',
              client_type: 'confidential',
              description: 'bar',
              name: 'foo',
              organization: { id: 1 },
              redirect_uris: 'http://www.google.com',
            })
          }
        >
          Submit
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  });

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

const application = {
  id: 1,
  type: 'o_auth2_application',
  name: 'Alex',
  description: '',
  client_type: 'confidential',
  redirect_uris: 'http://www.google.com',
  authorization_grant_type: 'authorization-code',
  summary_fields: {
    organization: { id: 230, name: 'bar' },
    user_capabilities: { edit: true, delete: true },
  },
  organization: 230,
};

function renderEdit(options) {
  return renderWithContexts(
    <ApplicationEdit
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

describe('<ApplicationEdit/>', () => {
  test('should cancel form properly', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/applications/1/edit'],
    });
    const { user } = renderEdit({ context: { router: { history } } });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(history.location.pathname).toBe('/applications/1/details');
  });

  test('should update and redirect on successful submit', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/applications/1/edit'],
    });
    ApplicationsAPI.update.mockResolvedValue({ data: {} });
    const { user } = renderEdit({ context: { router: { history } } });

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(ApplicationsAPI.update).toHaveBeenCalledWith(1, {
        authorization_grant_type: 'authorization-code',
        client_type: 'confidential',
        description: 'bar',
        name: 'foo',
        organization: 1,
        redirect_uris: 'http://www.google.com',
      })
    );
    await waitFor(() =>
      expect(history.location.pathname).toBe('/applications/1/details')
    );
  });

  test('should show form submit error on failed update', async () => {
    ApplicationsAPI.update.mockRejectedValue({
      response: {
        config: { method: 'patch', url: '/api/v2/applications/' },
        data: { detail: 'An error occurred' },
      },
    });
    const { user } = renderEdit();

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('FormSubmitError')).toBeInTheDocument();
  });
});
