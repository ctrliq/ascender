import React from 'react';
import { Formik } from 'formik';
import { screen, waitFor } from '@testing-library/react';
import { ProjectsAPI, CredentialsAPI } from 'api';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import SCMSubForm from './SCMSubForm';

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

describe('<SCMSubForm />', () => {
  beforeEach(() => {
    CredentialsAPI.read.mockResolvedValue({
      data: { count: 0, results: [] },
    });
    ProjectsAPI.readInventories.mockResolvedValue({
      data: ['foo', 'bar'],
    });
    ProjectsAPI.read.mockResolvedValue({
      data: {
        count: 2,
        results: [
          {
            id: 1,
            name: 'mock proj one',
          },
          {
            id: 2,
            name: 'mock proj two',
          },
        ],
      },
    });
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  function renderForm(values = initialValues) {
    return renderWithContexts(
      <Formik initialValues={values}>
        <SCMSubForm />
      </Formik>
    );
  }

  test('should render subform fields', async () => {
    renderForm();
    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalled());
    expect(screen.getByText('Credential')).toBeInTheDocument();
    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(screen.getByText('Inventory file')).toBeInTheDocument();
    expect(screen.getByText('Verbosity')).toBeInTheDocument();
    expect(screen.getByText('Update options')).toBeInTheDocument();
    expect(screen.getByText('Cache timeout (seconds)')).toBeInTheDocument();
    expect(screen.getByText('Source variables')).toBeInTheDocument();
  });

  test('should not fetch source path list without an initial project', async () => {
    renderForm();
    await waitFor(() => expect(CredentialsAPI.read).toHaveBeenCalled());
    expect(ProjectsAPI.readInventories).not.toHaveBeenCalled();
  });

  test('an initial source project fetches its inventory file list', async () => {
    // mounting with an initial source_project runs the effect that fetches the
    // project's available inventory files via ProjectsAPI.readInventories.
    renderForm({
      ...initialValues,
      source_project: { id: 2, name: 'mock proj two' },
    });
    await waitFor(() =>
      expect(ProjectsAPI.readInventories).toHaveBeenCalledWith(2)
    );
  });

  test('defaults source path to project root when none is set', async () => {
    // with an initial project but an empty source_path, the effect seeds the
    // source_path field with the synthetic "/ (project root)" entry; the
    // typeahead input reflects that value.
    renderForm({
      ...initialValues,
      source_project: { id: 2, name: 'mock proj two' },
    });
    await waitFor(() =>
      expect(ProjectsAPI.readInventories).toHaveBeenCalledWith(2)
    );
    const sourcePathInput = screen.getByLabelText('Select source path');
    await waitFor(() =>
      expect(sourcePathInput).toHaveValue('/ (project root)')
    );
  });

  test('renders a preselected custom source path', async () => {
    // a source_path value that is not in the fetched list (a user-created custom
    // path) is preserved and shown in the typeahead input.
    renderForm({
      ...initialValues,
      credential: { id: 1, name: 'Credential' },
      source_path: '/custom/path',
      source_project: { id: 1, name: 'Source project' },
    });
    await waitFor(() => expect(ProjectsAPI.readInventories).toHaveBeenCalled());
    expect(screen.getByLabelText('Select source path')).toHaveValue(
      '/custom/path'
    );
  });
});
