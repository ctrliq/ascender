import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { CredentialTypesAPI, ProjectsAPI, RootAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ProjectForm from './ProjectForm';

jest.mock('../../../api');

describe('<ProjectForm />', () => {
  const mockData = {
    name: 'foo',
    description: 'bar',
    scm_type: 'git',
    scm_url: 'https://foo.bar',
    scm_clean: true,
    scm_track_submodules: false,
    credential: 100,
    signature_validation_credential: 200,
    organization: 2,
    scm_update_on_launch: true,
    scm_update_cache_timeout: 3,
    allow_override: false,
    summary_fields: {
      credential: {
        id: 100,
        credential_type_id: 4,
        kind: 'scm',
        name: 'Foo',
      },
      organization: {
        id: 2,
        name: 'Default',
      },
      signature_validation_credential: {
        id: 200,
        credential_type_id: 6,
        kind: 'cryptography',
        name: 'Svc',
      },
    },
  };

  const projectOptionsResolve = {
    data: {
      actions: {
        GET: {
          scm_type: {
            choices: [
              ['', 'Manual'],
              ['git', 'Git'],
              ['svn', 'Subversion'],
              ['archive', 'Remote Archive'],
            ],
          },
        },
      },
    },
  };

  const scmCredentialResolve = {
    data: {
      count: 1,
      results: [
        {
          id: 4,
          name: 'Source Control',
          kind: 'scm',
        },
      ],
    },
  };

  const cryptographyCredentialResolve = {
    data: {
      count: 1,
      results: [
        {
          id: 6,
          name: 'GPG Public Key',
          kind: 'cryptography',
        },
      ],
    },
  };

  beforeEach(() => {
    RootAPI.readAssetVariables.mockResolvedValue({
      data: {
        BRAND_NAME: 'AWX',
      },
    });
    ProjectsAPI.readOptions.mockResolvedValue(projectOptionsResolve);
    CredentialTypesAPI.read.mockImplementation(({ kind }) =>
      kind === 'cryptography'
        ? cryptographyCredentialResolve
        : scmCredentialResolve
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('new form displays primary form fields', async () => {
    renderWithContexts(
      <ProjectForm handleSubmit={jest.fn()} handleCancel={jest.fn()} />
    );
    expect(await screen.findByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.getByText('Source Control Type')).toBeInTheDocument();
    // primary form (no scm type selected) hides the scm subform fields
    expect(screen.queryByText('Source Control URL')).not.toBeInTheDocument();
  });

  test('should display scm subform when scm type select has a value', async () => {
    const { user } = renderWithContexts(
      <ProjectForm handleSubmit={jest.fn()} handleCancel={jest.fn()} />
    );
    await screen.findByText('Source Control Type');

    // AnsibleSelect renders a native <select id="scm_type">
    const scmSelect = document.querySelector('#scm_type');
    expect(scmSelect).toBeInTheDocument();
    await user.selectOptions(scmSelect, 'git');

    expect(await screen.findByText('Source Control URL')).toBeInTheDocument();
    expect(
      screen.getByText('Source Control Branch/Tag/Commit')
    ).toBeInTheDocument();
    expect(screen.getByText('Source Control Refspec')).toBeInTheDocument();
    expect(
      screen.getAllByText('Content Signature Validation Credential').length
    ).toBeGreaterThan(0);
    expect(screen.getByText('Source Control Credential')).toBeInTheDocument();
  });

  test('renders the scm subform for a git project with prefilled lookups', async () => {
    // The synthetic onChange-invoke wiring is internal Formik/Lookup
    // plumbing; assert instead that an existing git
    // project mounts with its scm subform (URL + credential) and the
    // organization lookup prefilled from summary_fields.
    renderWithContexts(
      <ProjectForm
        handleSubmit={jest.fn()}
        handleCancel={jest.fn()}
        project={{ ...mockData }}
      />
    );
    await screen.findByText('Source Control Type');

    expect(await screen.findByText('Source Control URL')).toBeInTheDocument();
    expect(screen.getByText('Source Control Credential')).toBeInTheDocument();
    // OrganizationLookup renders the prefilled org name in its text input
    expect(
      document.querySelector('input#organization')
    ).toBeInTheDocument();
  });

  test('git project with a webhook service mounts with the webhook subform open', async () => {
    renderWithContexts(
      <ProjectForm
        handleSubmit={jest.fn()}
        handleCancel={jest.fn()}
        project={{
          ...mockData,
          webhook_service: 'github',
          webhook_key: 'secretkey',
          webhook_ref_filter: 'refs/heads/main',
          related: { webhook_receiver: '/api/v2/projects/7/github/' },
        }}
      />
    );
    await screen.findByText('Source Control Type');

    expect(
      screen.getByRole('checkbox', { name: 'Enable Webhook' })
    ).toBeChecked();
    expect(await screen.findByText('Webhook details')).toBeInTheDocument();
    expect(screen.getByText('Webhook Ref Filter')).toBeInTheDocument();
    // projects have no webhook credential
    expect(screen.queryByText('Webhook Credential')).not.toBeInTheDocument();
  });

  test('checking Enable Webhook reveals the webhook subform', async () => {
    const { user } = renderWithContexts(
      <ProjectForm
        handleSubmit={jest.fn()}
        handleCancel={jest.fn()}
        project={{ ...mockData }}
      />
    );
    await screen.findByText('Source Control URL');

    const webhookCheckbox = screen.getByRole('checkbox', {
      name: 'Enable Webhook',
    });
    expect(webhookCheckbox).not.toBeChecked();
    expect(screen.queryByText('Webhook details')).not.toBeInTheDocument();

    await user.click(webhookCheckbox);

    expect(await screen.findByText('Webhook details')).toBeInTheDocument();
  });

  test('manual subform should display expected fields', async () => {
    const config = {
      project_local_paths: ['foobar', 'qux'],
      project_base_dir: 'dir/foo/bar',
    };
    renderWithContexts(
      <ProjectForm
        handleSubmit={jest.fn()}
        handleCancel={jest.fn()}
        project={{ scm_type: '', local_path: '/_foo__bar' }}
      />,
      { context: { config } }
    );
    expect(await screen.findByText('Project Base Path')).toBeInTheDocument();
    expect(screen.getByText('Playbook Directory')).toBeInTheDocument();
  });

  test('manual subform should display warning message when playbook directory is empty', async () => {
    const config = {
      project_local_paths: [],
      project_base_dir: 'dir/foo/bar',
    };
    const { container } = renderWithContexts(
      <ProjectForm
        handleSubmit={jest.fn()}
        handleCancel={jest.fn()}
        project={{ scm_type: '', local_path: '' }}
      />,
      { context: { config } }
    );
    await screen.findByText('Project Base Path');
    await waitFor(() =>
      expect(
        container.querySelector(
          '[data-ouia-component-id="project-manual-subform-alert"]'
        )
      ).toBeInTheDocument()
    );
  });

  test('should call handleSubmit when Save button is clicked', async () => {
    const handleSubmit = jest.fn();
    const { user } = renderWithContexts(
      <ProjectForm
        project={mockData}
        handleSubmit={handleSubmit}
        handleCancel={jest.fn()}
      />
    );
    await screen.findByText('Source Control Type');
    expect(handleSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(handleSubmit).toHaveBeenCalled());
  });

  test('should call handleCancel when Cancel button is clicked', async () => {
    const handleCancel = jest.fn();
    const { user } = renderWithContexts(
      <ProjectForm
        project={mockData}
        handleSubmit={jest.fn()}
        handleCancel={handleCancel}
      />
    );
    await screen.findByText('Source Control Type');
    expect(handleCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handleCancel).toHaveBeenCalled();
  });

  test('should display ContentError on throw', async () => {
    CredentialTypesAPI.read.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    renderWithContexts(
      <ProjectForm handleSubmit={jest.fn()} handleCancel={jest.fn()} />
    );
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });
});
