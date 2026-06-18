import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { ApplicationsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ApplicationAdd from './ApplicationAdd';

jest.mock('../../../api/models/Applications');
jest.mock('../../../api/models/Organizations');

// The real form is exercised in ApplicationForm.test.js; here we mock it so the
// container's readOptions/create/navigation/submit-error logic is what's tested.
// onSubmit receives the form values (organization as an object, per the form);
// onCancel is wired to the container's handleCancel.
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

const options = {
  data: {
    actions: {
      GET: {
        client_type: {
          choices: [
            ['confidential', 'Confidential'],
            ['public', 'Public'],
          ],
        },
        authorization_grant_type: {
          choices: [
            ['authorization-code', 'Authorization code'],
            ['password', 'Resource owner password-based'],
          ],
        },
      },
    },
  },
};

afterEach(() => {
  jest.clearAllMocks();
});

describe('<ApplicationAdd/>', () => {
  const onSuccessfulAdd = jest.fn();

  test('should render properly and read options', async () => {
    ApplicationsAPI.readOptions.mockResolvedValue(options);

    renderWithContexts(<ApplicationAdd onSuccessfulAdd={onSuccessfulAdd} />);

    expect(
      await screen.findByRole('button', { name: 'Submit' })
    ).toBeInTheDocument();
    expect(ApplicationsAPI.readOptions).toHaveBeenCalled();
  });

  test('should create and redirect on successful submit', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/applications/add'],
    });
    ApplicationsAPI.readOptions.mockResolvedValue(options);
    ApplicationsAPI.create.mockResolvedValue({ data: { id: 8 } });

    const { user } = renderWithContexts(
      <ApplicationAdd onSuccessfulAdd={onSuccessfulAdd} />,
      { context: { router: { history } } }
    );
    await screen.findByRole('button', { name: 'Submit' });

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(ApplicationsAPI.create).toHaveBeenCalledWith({
        authorization_grant_type: 'authorization-code',
        client_type: 'confidential',
        description: 'bar',
        name: 'foo',
        organization: 1,
        redirect_uris: 'http://www.google.com',
      })
    );
    expect(onSuccessfulAdd).toHaveBeenCalledWith({ id: 8 });
    await waitFor(() =>
      expect(history.location.pathname).toBe('/applications/8/details')
    );
  });

  test('should cancel form properly', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/applications/add'],
    });
    ApplicationsAPI.readOptions.mockResolvedValue(options);

    const { user } = renderWithContexts(
      <ApplicationAdd onSuccessfulAdd={onSuccessfulAdd} />,
      { context: { router: { history } } }
    );
    await screen.findByRole('button', { name: 'Cancel' });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(history.location.pathname).toBe('/applications');
  });

  test('should show form submit error on failed create', async () => {
    ApplicationsAPI.readOptions.mockResolvedValue(options);
    ApplicationsAPI.create.mockRejectedValue({
      response: {
        config: { method: 'patch', url: '/api/v2/applications/' },
        data: { detail: 'An error occurred' },
      },
    });

    const { user } = renderWithContexts(
      <ApplicationAdd onSuccessfulAdd={onSuccessfulAdd} />
    );
    await screen.findByRole('button', { name: 'Submit' });

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('FormSubmitError')).toBeInTheDocument();
  });

  test('should render content error on failed read options request', async () => {
    ApplicationsAPI.readOptions.mockRejectedValue(new Error());

    renderWithContexts(<ApplicationAdd onSuccessfulAdd={onSuccessfulAdd} />);

    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });
});
