import React from 'react';
import { createMemoryHistory } from 'history';
import { screen, waitFor } from '@testing-library/react';
import { JobTemplatesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import JobTemplateAdd from './JobTemplateAdd';

jest.mock('../../../api');

const jobTemplateData = {
  allow_callbacks: false,
  allow_simultaneous: false,
  ask_credential_on_launch: false,
  ask_diff_mode_on_launch: false,
  ask_execution_environment_on_launch: false,
  ask_forks_on_launch: false,
  ask_instance_groups_on_launch: false,
  ask_inventory_on_launch: false,
  ask_job_slice_count_on_launch: false,
  ask_job_type_on_launch: false,
  ask_labels_on_launch: false,
  ask_limit_on_launch: false,
  ask_scm_branch_on_launch: false,
  ask_skip_tags_on_launch: false,
  ask_tags_on_launch: false,
  ask_timeout_on_launch: false,
  ask_variables_on_launch: false,
  ask_verbosity_on_launch: false,
  become_enabled: false,
  description: '',
  diff_mode: false,
  extra_vars: '---\n',
  forks: 0,
  host_config_key: '',
  job_slice_count: 1,
  job_tags: '',
  job_type: 'run',
  limit: '',
  name: '',
  playbook: '',
  prevent_instance_group_fallback: false,
  scm_branch: '',
  skip_tags: '',
  timeout: 0,
  use_fact_cache: false,
  verbosity: '0',
};

// The form is exercised on its own in JobTemplateForm.test.js; here we only
// care about the container wiring submit/cancel and transforming form values
// into the JobTemplatesAPI.create payload, so stub the form with controls that
// invoke its props. The submit button passes a values object that mirrors what
// the real form produces. (Names referenced inside the mock factory are mock-
// prefixed so jest's out-of-scope guard allows them.)
const mockSubmitValues = {
  allow_callbacks: false,
  allow_simultaneous: false,
  ask_credential_on_launch: false,
  ask_diff_mode_on_launch: false,
  ask_execution_environment_on_launch: false,
  ask_forks_on_launch: false,
  ask_instance_groups_on_launch: false,
  ask_inventory_on_launch: false,
  ask_job_slice_count_on_launch: false,
  ask_job_type_on_launch: false,
  ask_labels_on_launch: false,
  ask_limit_on_launch: false,
  ask_scm_branch_on_launch: false,
  ask_skip_tags_on_launch: false,
  ask_tags_on_launch: false,
  ask_timeout_on_launch: false,
  ask_variables_on_launch: false,
  ask_verbosity_on_launch: false,
  become_enabled: false,
  description: '',
  diff_mode: false,
  extra_vars: '---\n',
  forks: 0,
  host_config_key: '',
  job_slice_count: 1,
  job_tags: '',
  job_type: 'check',
  limit: '',
  name: 'Bar',
  playbook: 'ping-playbook.yml',
  prevent_instance_group_fallback: false,
  scm_branch: '',
  skip_tags: '',
  timeout: 0,
  use_fact_cache: false,
  verbosity: '0',
  project: {
    id: 2,
    name: 'project',
    summary_fields: { organization: { id: 1, name: 'Org Foo' } },
  },
  inventory: { id: 2, organization: 1 },
  execution_environment: { id: 1, name: 'Foo' },
  webhook_credential: undefined,
  webhook_service: '',
};
const mockFormProps = { current: undefined };
jest.mock('../shared/JobTemplateForm', () =>
  function MockJobTemplateForm(props) {
    mockFormProps.current = props;
    const { handleSubmit, handleCancel } = props;
    return (
      <div>
        <button type="button" onClick={() => handleSubmit(mockSubmitValues)}>
          Submit
        </button>
        <button type="button" aria-label="Cancel" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    );
  }
);

describe('<JobTemplateAdd />', () => {
  afterEach(() => {
    jest.resetAllMocks();
    mockFormProps.current = undefined;
  });

  test('should render Job Template Form', async () => {
    renderWithContexts(<JobTemplateAdd />);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });

  test('handleSubmit should post to api', async () => {
    JobTemplatesAPI.create.mockResolvedValueOnce({
      data: {
        id: 1,
        type: 'job_template',
        ...jobTemplateData,
      },
    });
    const { user } = renderWithContexts(<JobTemplateAdd />);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(JobTemplatesAPI.create).toHaveBeenCalledWith({
        ...jobTemplateData,
        name: 'Bar',
        job_type: 'check',
        project: 2,
        playbook: 'ping-playbook.yml',
        inventory: 2,
        webhook_credential: undefined,
        webhook_service: '',
        execution_environment: 1,
      })
    );
  });

  test('should navigate to job template detail after form submission', async () => {
    const history = createMemoryHistory({});
    JobTemplatesAPI.create.mockResolvedValueOnce({
      data: {
        id: 1,
        type: 'job_template',
        ...jobTemplateData,
      },
    });
    const { user } = renderWithContexts(<JobTemplateAdd />, {
      context: { router: { history } },
    });
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/templates/job_template/1/details'
      )
    );
  });

  test('should navigate to templates list when cancel is clicked', async () => {
    const history = createMemoryHistory({});
    const { user } = renderWithContexts(<JobTemplateAdd />, {
      context: { router: { history } },
    });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/templates');
  });

  test('should parse and pre-fill project field from query params', async () => {
    const history = createMemoryHistory({
      initialEntries: [
        '/templates/job_template/add?resource_id=6&resource_name=Demo%20Project&resource_type=project',
      ],
    });
    renderWithContexts(<JobTemplateAdd />, {
      context: { router: { history } },
    });
    // The container parses location.search into resourceValues and passes it to
    // the form, which is where the project pre-fill + readPlaybooks(6) happen.
    await waitFor(() =>
      expect(mockFormProps.current.resourceValues).toEqual({
        id: '6',
        name: 'Demo Project',
        type: 'project',
        kind: null,
      })
    );
  });

  test('should not build resourceValues if there is no project', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/templates/job_template/add'],
    });
    renderWithContexts(<JobTemplateAdd />, {
      context: { router: { history } },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument()
    );
    expect(mockFormProps.current.resourceValues).toBe(null);
  });
});
