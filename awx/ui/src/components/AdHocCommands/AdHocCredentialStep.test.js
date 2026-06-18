import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
import { CredentialsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import AdHocCredentialStep from './AdHocCredentialStep';

jest.mock('../../api/models/Credentials');

describe('<AdHocCredentialStep />', () => {
  const onEnableLaunch = jest.fn();
  beforeEach(async () => {
    CredentialsAPI.read.mockResolvedValue({
      data: {
        results: [
          { id: 1, name: 'Cred 1', url: 'wwww.google.com' },
          { id: 2, name: 'Cred2', url: 'wwww.google.com' },
        ],
        count: 2,
      },
    });
    CredentialsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} } },
    });
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should mount properly', async () => {
    renderWithContexts(
      <Formik>
        <AdHocCredentialStep credentialTypeId={1} onEnableLaunch={onEnableLaunch} />
      </Formik>
    );
    // OptionsList renders the fetched credential rows once loading resolves
    await waitFor(() => expect(screen.getByText('Cred 1')).toBeInTheDocument());
  });

  test('should call api', async () => {
    renderWithContexts(
      <Formik>
        <AdHocCredentialStep credentialTypeId={1} onEnableLaunch={onEnableLaunch} />
      </Formik>
    );
    await waitFor(() => expect(screen.getByText('Cred 1')).toBeInTheDocument());
    expect(CredentialsAPI.read).toHaveBeenCalled();
    // two CheckboxListItem rows (one per result) render a radio select cell
    expect(screen.getByText('Cred2')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });
});
