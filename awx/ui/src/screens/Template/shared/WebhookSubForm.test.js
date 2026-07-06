import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';

import { Formik } from 'formik';
import { CredentialsAPI, CredentialTypesAPI, ProjectsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import WebhookSubForm from './WebhookSubForm';

jest.mock('../../../api');

describe('<WebhookSubForm />', () => {
  let history;
  const initialValues = {
    webhook_url: '/api/v2/job_templates/51/github/',
    webhook_credential: { id: 1, name: 'Github credential' },
    webhook_service: 'github',
    webhook_key: 'webhook key',
  };

  const renderForm = (values, templateType, pathname) => {
    history = createMemoryHistory({ initialEntries: [`/${pathname}`] });
    return renderWithContexts(
      <Routes>
        <Route
          path="/templates/:templateType/:id/edit"
          element={
            <Formik initialValues={values}>
              <WebhookSubForm templateType={templateType} />
            </Formik>
          }
        />
      </Routes>,
      {
        context: {
          router: {
            history,
          },
        },
      }
    );
  };

  beforeEach(async () => {
    history = createMemoryHistory({
      initialEntries: ['/templates/job_template/51/edit'],
    });
    CredentialsAPI.read.mockResolvedValue({
      data: { results: [{ id: 12, name: 'Github credential' }] },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render initial values properly', async () => {
    renderForm(initialValues, 'job_template', 'templates/job_template/51/edit');

    // AnsibleSelect for webhook service
    expect(await screen.findByLabelText('Select Input')).toHaveValue('github');
    expect(screen.getByLabelText('Webhook URL')).toHaveValue(
      '/api/v2/job_templates/51/github/'
    );
    expect(
      screen.getByLabelText('workflow job template webhook key')
    ).toHaveValue('webhook key');
    // credential lookup input is populated with the credential name
    expect(document.getElementById('credential')).toHaveValue(
      'Github credential'
    );
  });

  test('should make other credential type available', async () => {
    CredentialsAPI.read.mockResolvedValue({
      data: { results: [{ id: 13, name: 'GitLab credential' }] },
    });
    renderForm(initialValues, 'job_template', 'templates/job_template/51/edit');

    const serviceSelect = await screen.findByLabelText('Select Input');
    fireEvent.change(serviceSelect, { target: { value: 'gitlab' } });

    await waitFor(() =>
      expect(CredentialsAPI.read).toHaveBeenCalledWith({
        namespace: 'gitlab_token',
      })
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Webhook URL').value).toContain(
        '/api/v2/job_templates/51/gitlab/'
      )
    );
    // switching to another service clears the key: a new one is generated on
    // save unless the user types their own
    expect(
      screen.getByLabelText('workflow job template webhook key')
    ).toHaveValue('');
  });

  test('should have disabled button to update webhook key when there is no saved key', async () => {
    renderForm(
      {
        ...initialValues,
        webhook_key: '',
      },
      'job_template',
      'templates/job_template/51/edit'
    );

    expect(
      await screen.findByRole('button', { name: 'Update webhook key' })
    ).toBeDisabled();
  });

  test('should accept a user supplied webhook key', async () => {
    renderForm(initialValues, 'job_template', 'templates/job_template/51/edit');

    const keyInput = await screen.findByLabelText(
      'workflow job template webhook key'
    );
    fireEvent.change(keyInput, { target: { value: 'my-own-secret' } });

    await waitFor(() => expect(keyInput).toHaveValue('my-own-secret'));
  });

  test('test whether the workflow template type is part of the webhook url', async () => {
    const webhook_url = '/api/v2/workflow_job_templates/42/github/';
    renderForm(
      { ...initialValues, webhook_url },
      'workflow_job_template',
      'templates/workflow_job_template/51/edit'
    );

    expect((await screen.findByLabelText('Webhook URL')).value).toContain(
      webhook_url
    );
  });

  test('should render credential lookup when the credential type resolves', async () => {
    CredentialTypesAPI.read.mockResolvedValue({
      data: { results: [{ id: 9, name: 'GitHub Personal Access Token' }] },
    });
    CredentialsAPI.read.mockResolvedValue({
      data: { results: [{ id: 12, name: 'Github credential' }], count: 1 },
    });
    CredentialsAPI.readOptions.mockResolvedValue({
      data: {
        actions: { GET: {}, POST: {} },
        related_search_fields: [],
      },
    });
    renderForm(initialValues, 'job_template', 'templates/job_template/51/edit');

    // CredentialLookup renders a FormGroup labeled "Webhook Credential"
    expect(await screen.findByText('Webhook Credential')).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Unable to look up the credential type for this webhook service, so the webhook credential field is unavailable.'
      )
    ).not.toBeInTheDocument();
  });

  test('should warn instead of failing silently when no credential type is found', async () => {
    CredentialTypesAPI.read.mockResolvedValue({ data: { results: [] } });
    renderForm(initialValues, 'job_template', 'templates/job_template/51/edit');

    // warning Alert is shown, credential lookup is not
    expect(
      await screen.findByText(
        'Unable to look up the credential type for this webhook service, so the webhook credential field is unavailable.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('Webhook Credential')).not.toBeInTheDocument();
  });

  describe('project webhooks', () => {
    const projectInitialValues = {
      webhook_url: '/api/v2/projects/7/github/',
      webhook_service: 'github',
      webhook_key: 'webhook key',
      webhook_ref_filter: '',
    };

    const renderProjectForm = (values) => {
      history = createMemoryHistory({ initialEntries: ['/projects/7/edit'] });
      return renderWithContexts(
        <Routes>
          <Route
            path="/projects/:id/edit"
            element={
              <Formik initialValues={values}>
                <WebhookSubForm templateType="project" />
              </Formik>
            }
          />
        </Routes>,
        {
          context: {
            router: {
              history,
            },
          },
        }
      );
    };

    test('should render ref filter and skip the credential lookup', async () => {
      renderProjectForm(projectInitialValues);

      expect(await screen.findByLabelText('Select Input')).toHaveValue(
        'github'
      );
      expect(screen.getByLabelText('Webhook URL')).toHaveValue(
        '/api/v2/projects/7/github/'
      );
      expect(screen.getByText('Webhook Ref Filter')).toBeInTheDocument();
      // projects have no webhook credential, so neither the lookup nor the
      // missing credential type warning should render
      expect(CredentialTypesAPI.read).not.toHaveBeenCalled();
      expect(screen.queryByText('Webhook Credential')).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          'Unable to look up the credential type for this webhook service, so the webhook credential field is unavailable.'
        )
      ).not.toBeInTheDocument();
    });

    test('should rotate the webhook key through the projects API', async () => {
      ProjectsAPI.updateWebhookKey.mockResolvedValue({
        data: { webhook_key: 'brandnewkey123' },
      });
      renderProjectForm(projectInitialValues);

      fireEvent.click(
        await screen.findByRole('button', { name: 'Update webhook key' })
      );
      await waitFor(() =>
        expect(ProjectsAPI.updateWebhookKey).toHaveBeenCalledWith('7')
      );
    });
  });
});
