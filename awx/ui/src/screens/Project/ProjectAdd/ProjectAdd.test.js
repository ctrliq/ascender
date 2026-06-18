import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { ProjectsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ProjectAdd from './ProjectAdd';

jest.mock('../../../api');

const projectData = {
  name: 'foo',
  description: 'bar',
  scm_type: 'git',
  scm_url: 'https://foo.bar',
  scm_clean: true,
  scm_track_submodules: false,
  credential: 100,
  signature_validation_credential: 200,
  local_path: '',
  organization: { id: 2, name: 'Bar' },
  scm_update_on_launch: true,
  scm_update_cache_timeout: 3,
  allow_override: false,
  default_environment: { id: 1, name: 'Foo' },
};

// Mock the shared ProjectForm so the container's submit/cancel branches can be
// driven directly. The buttons call the container's real handleSubmit/handleCancel.
jest.mock('../shared/ProjectForm', () => ({
  __esModule: true,
  default: ({ handleSubmit, handleCancel, submitError }) => {
    const ReactLib = require('react');
    // mirror projectData; jest.mock factories cannot close over outer vars
    const values = {
      name: 'foo',
      description: 'bar',
      scm_type: 'git',
      scm_url: 'https://foo.bar',
      scm_clean: true,
      scm_track_submodules: false,
      credential: 100,
      signature_validation_credential: 200,
      local_path: '',
      organization: { id: 2, name: 'Bar' },
      scm_update_on_launch: true,
      scm_update_cache_timeout: 3,
      allow_override: false,
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
      submitError
        ? ReactLib.createElement('div', null, 'submit-error')
        : null
    );
  },
}));

describe('<ProjectAdd />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('handleSubmit should post to the api', async () => {
    ProjectsAPI.create.mockResolvedValueOnce({
      data: { ...projectData, id: 5 },
    });
    const { user } = renderWithContexts(<ProjectAdd />);

    await user.click(screen.getByRole('button', { name: 'mock-submit' }));

    await waitFor(() => expect(ProjectsAPI.create).toHaveBeenCalledTimes(1));
    expect(ProjectsAPI.create).toHaveBeenCalledWith({
      ...projectData,
      organization: 2,
      default_environment: 1,
      signature_validation_credential: 200,
    });
  });

  test('successful submission navigates to the new project details', async () => {
    const history = createMemoryHistory();
    ProjectsAPI.create.mockResolvedValueOnce({
      data: { ...projectData, id: 5 },
    });
    const { user } = renderWithContexts(<ProjectAdd />, {
      context: { router: { history } },
    });

    await user.click(screen.getByRole('button', { name: 'mock-submit' }));

    await waitFor(() =>
      expect(history.location.pathname).toEqual('/projects/5/details')
    );
  });

  test('handleSubmit should surface submit error', async () => {
    const error = {
      response: {
        config: {
          method: 'create',
          url: '/api/v2/projects/',
        },
        data: { detail: 'An error occurred' },
      },
    };
    ProjectsAPI.create.mockRejectedValue(error);
    const { user } = renderWithContexts(<ProjectAdd />);

    await user.click(screen.getByRole('button', { name: 'mock-submit' }));

    expect(await screen.findByText('submit-error')).toBeInTheDocument();
    expect(ProjectsAPI.create).toHaveBeenCalledTimes(1);
  });

  test('Cancel button should navigate to projects list', async () => {
    const history = createMemoryHistory();
    const { user } = renderWithContexts(<ProjectAdd />, {
      context: { router: { history } },
    });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(history.location.pathname).toEqual('/projects');
  });
});
