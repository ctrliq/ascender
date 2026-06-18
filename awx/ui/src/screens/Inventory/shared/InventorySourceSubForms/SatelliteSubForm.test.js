import React from 'react';
import { Formik } from 'formik';
import { waitFor } from '@testing-library/react';
import { CredentialsAPI } from 'api';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import SatelliteSubForm from './SatelliteSubForm';

jest.mock('../../../../api');

const initialValues = {
  credential: null,
  overwrite: false,
  overwrite_vars: false,
  source_path: '',
  source_project: null,
  source_script: null,
  source_vars: '---\n',
  update_cache_timeout: 0,
  update_on_launch: true,
  verbosity: 1,
};

describe('<SatelliteSubForm />', () => {
  beforeEach(() => {
    CredentialsAPI.read.mockResolvedValue({
      data: { count: 0, results: [] },
    });
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  function renderForm() {
    return renderWithContexts(
      <Formik initialValues={initialValues}>
        <SatelliteSubForm />
      </Formik>
    );
  }

  test('should render subform fields', async () => {
    const { getByText } = renderForm();
    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalled());
    expect(getByText('Credential')).toBeInTheDocument();
    expect(getByText('Verbosity')).toBeInTheDocument();
    expect(getByText('Update options')).toBeInTheDocument();
    expect(getByText('Cache timeout (seconds)')).toBeInTheDocument();
    expect(getByText('Source variables')).toBeInTheDocument();
  });

  test('should make expected api calls', async () => {
    renderForm();
    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalledTimes(1));
    expect(CredentialsAPI.read).toHaveBeenCalledWith({
      credential_type__namespace: 'satellite6',
      order_by: 'name',
      page: 1,
      page_size: 5,
    });
  });
});
