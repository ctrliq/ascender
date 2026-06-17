import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';

import { CredentialTypesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import CredentialTypeAdd from './CredentialTypeAdd';

jest.mock('../../../api');

const mockCredentialTypeData = {
  name: 'Foo',
  description: 'Bar',
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
};

// The form is exercised on its own in CredentialTypeForm.test.js; here we only
// care about the container's submit/cancel/error handling, so stub the form
// with controls that invoke its props.
jest.mock('../shared/CredentialTypeForm', () =>
  function MockCredentialTypeForm({ onSubmit, onCancel, submitError }) {
    return (
      <div>
        {submitError ? <div data-testid="form-submit-error" /> : null}
        <button type="button" onClick={() => onSubmit(mockCredentialTypeData)}>
          Submit
        </button>
        <button type="button" aria-label="Cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }
);

describe('<CredentialTypeAdd/>', () => {
  let history;

  const renderAdd = () => {
    history = createMemoryHistory({ initialEntries: ['/credential_types'] });
    return renderWithContexts(<CredentialTypeAdd />, {
      context: { router: { history } },
    });
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('handleSubmit should call the api and redirect to details page', async () => {
    CredentialTypesAPI.create.mockResolvedValue({ data: { id: 42 } });
    const { user } = renderAdd();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(CredentialTypesAPI.create).toHaveBeenCalledWith({
        ...mockCredentialTypeData,
        inputs: JSON.parse(mockCredentialTypeData.inputs),
        injectors: JSON.parse(mockCredentialTypeData.injectors),
        kind: 'cloud',
      })
    );
    expect(history.location.pathname).toBe('/credential_types/42/details');
  });

  test('handleCancel should return the user back to the credential types list', async () => {
    const { user } = renderAdd();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/credential_types');
  });

  test('failed form submission should show an error message', async () => {
    CredentialTypesAPI.create.mockRejectedValue({
      response: { data: { detail: 'An error occurred' } },
    });
    const { user } = renderAdd();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByTestId('form-submit-error')).toBeInTheDocument();
  });
});
