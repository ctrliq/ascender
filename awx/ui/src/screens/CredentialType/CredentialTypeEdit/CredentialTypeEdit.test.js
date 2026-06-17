import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';

import { CredentialTypesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import CredentialTypeEdit from './CredentialTypeEdit';

jest.mock('../../../api');

const credentialTypeData = {
  id: 42,
  name: 'Foo',
  description: 'New credential',
  kind: 'cloud',
  inputs: JSON.stringify({
    fields: [
      { id: 'username', type: 'string', label: 'Jenkins username' },
      { id: 'password', type: 'string', label: 'Jenkins password', secret: true },
    ],
    required: ['username', 'password'],
  }),
  injectors: JSON.stringify({
    extra_vars: {
      Jenkins_password: '{{ password }}',
      Jenkins_username: '{{ username }}',
    },
  }),
  summary_fields: {
    created_by: { id: 1, username: 'admin', first_name: '', last_name: '' },
    modified_by: { id: 1, username: 'admin', first_name: '', last_name: '' },
    user_capabilities: { edit: true, delete: true },
  },
  created: '2020-06-25T16:52:36.127008Z',
  modified: '2020-06-25T16:52:36.127022Z',
};

const mockUpdateData = {
  name: 'Bar',
  description: 'Updated new Credential Type',
  injectors: credentialTypeData.injectors,
  inputs: credentialTypeData.inputs,
};

// The form has its own suite; stub it so we can drive the container's
// submit/cancel/error handling directly.
jest.mock('../shared/CredentialTypeForm', () =>
  function MockCredentialTypeForm({ onSubmit, onCancel, submitError }) {
    return (
      <div>
        {submitError ? <div data-testid="form-submit-error" /> : null}
        <button type="button" onClick={() => onSubmit(mockUpdateData)}>
          Submit
        </button>
        <button type="button" aria-label="Cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }
);

describe('<CredentialTypeEdit>', () => {
  let history;

  const renderEdit = () => {
    history = createMemoryHistory();
    return renderWithContexts(
      <CredentialTypeEdit credentialType={credentialTypeData} />,
      { context: { router: { history } } }
    );
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('handleSubmit should call the api and redirect to details page', async () => {
    CredentialTypesAPI.update.mockResolvedValue({});
    const { user } = renderEdit();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(CredentialTypesAPI.update).toHaveBeenCalledWith(42, {
        ...mockUpdateData,
        injectors: JSON.parse(credentialTypeData.injectors),
        inputs: JSON.parse(credentialTypeData.inputs),
      })
    );
    expect(history.location.pathname).toEqual('/credential_types/42/details');
  });

  test('should navigate to credential types detail when cancel is clicked', async () => {
    const { user } = renderEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/credential_types/42/details');
  });

  test('failed form submission should show an error message', async () => {
    CredentialTypesAPI.update.mockRejectedValue({
      response: { data: { detail: 'An error occurred' } },
    });
    const { user } = renderEdit();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByTestId('form-submit-error')).toBeInTheDocument();
  });
});
