import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { ProjectsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ProjectEdit from './ProjectEdit';

jest.mock('../../../api');

const projectData = {
  id: 123,
  name: 'foo',
  description: 'bar',
  scm_type: 'git',
  scm_url: 'https://foo.bar',
  scm_clean: true,
  scm_track_submodules: false,
  credential: 100,
  signature_validation_credential: 200,
  local_path: 'bar',
  organization: 2,
  scm_update_on_launch: true,
  scm_update_cache_timeout: 3,
  allow_override: false,
  summary_fields: {
    credential: {
      id: 100,
      credential_type_id: 5,
      kind: 'insights',
    },
    signature_validation_credential: {
      id: 200,
      credential_type_id: 6,
      kind: 'cryptography',
      name: 'foo',
    },
    organization: {
      id: 2,
      name: 'Default',
    },
  },
};

// the shape ProjectForm passes to handleSubmit (organization as an object)
const submitValues = {
  ...projectData,
  organization: { id: 2, name: 'Default' },
  default_environment: { id: 1, name: 'Foo' },
};

// Mock the shared ProjectForm so the container's submit/cancel branches can be
// driven directly.
jest.mock('../shared/ProjectForm', () => ({
  __esModule: true,
  default: ({ handleSubmit, handleCancel, submitError }) => {
    const ReactLib = require('react');
    // mirror submitValues; jest.mock factories cannot close over outer vars
    const values = {
      id: 123,
      name: 'foo',
      description: 'bar',
      scm_type: 'git',
      scm_url: 'https://foo.bar',
      scm_clean: true,
      scm_track_submodules: false,
      credential: 100,
      signature_validation_credential: 200,
      local_path: 'bar',
      scm_update_on_launch: true,
      scm_update_cache_timeout: 3,
      allow_override: false,
      summary_fields: {
        credential: { id: 100, credential_type_id: 5, kind: 'insights' },
        signature_validation_credential: {
          id: 200,
          credential_type_id: 6,
          kind: 'cryptography',
          name: 'foo',
        },
        organization: { id: 2, name: 'Default' },
      },
      organization: { id: 2, name: 'Default' },
      default_environment: { id: 1, name: 'Foo' },
    };
    return ReactLib.createElement(
      'div',
      null,
      ReactLib.createElement(
        'button',
        {
          type: 'button',
          'aria-label': 'mock-submit',
          onClick: () => handleSubmit({ ...values }),
        },
        'submit'
      ),
      ReactLib.createElement(
        'button',
        { type: 'button', 'aria-label': 'Cancel', onClick: handleCancel },
        'cancel'
      ),
      submitError ? ReactLib.createElement('div', null, 'submit-error') : null
    );
  },
}));

describe('<ProjectEdit />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('handleSubmit should call api update', async () => {
    ProjectsAPI.update.mockResolvedValueOnce({
      data: { ...projectData },
    });
    const { user } = renderWithContexts(<ProjectEdit project={projectData} />);

    await user.click(screen.getByRole('button', { name: 'mock-submit' }));

    await waitFor(() => expect(ProjectsAPI.update).toHaveBeenCalledTimes(1));
    expect(ProjectsAPI.update).toHaveBeenCalledWith(123, {
      ...submitValues,
      organization: 2,
      default_environment: 1,
      signature_validation_credential: 200,
    });
  });

  test('handleSubmit should surface submit error', async () => {
    const error = new Error('oops');
    ProjectsAPI.update.mockImplementation(() => Promise.reject(error));
    const { user } = renderWithContexts(<ProjectEdit project={projectData} />);

    await user.click(screen.getByRole('button', { name: 'mock-submit' }));

    expect(await screen.findByText('submit-error')).toBeInTheDocument();
    expect(ProjectsAPI.update).toHaveBeenCalledTimes(1);
  });

  test('Cancel button should navigate to project details', async () => {
    const history = createMemoryHistory();
    const { user } = renderWithContexts(<ProjectEdit project={projectData} />, {
      context: { router: { history } },
    });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(history.location.pathname).toEqual('/projects/123/details');
  });
});
