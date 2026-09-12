import React from 'react';
import { Formik } from 'formik';
import { waitFor } from '@testing-library/react';
import { CredentialsAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import AzureSubForm from './AzureSubForm';

vi.mock('../../../../api');

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

const mockSourceOptions = {
  actions: {
    POST: {},
  },
};

describe('<AzureSubForm />', () => {
  beforeEach(() => {
    vi.mocked(CredentialsAPI.read).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof CredentialsAPI.read>);
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  function renderForm() {
    return renderWithContexts(
      <Formik onSubmit={() => {}} initialValues={initialValues}>
        <AzureSubForm sourceOptions={mockSourceOptions} />
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
      credential_type__namespace: 'azure_rm',
      order_by: 'name',
      page: 1,
      page_size: 5,
    });
  });
});
