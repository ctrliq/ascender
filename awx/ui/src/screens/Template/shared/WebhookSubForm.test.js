import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { Route } from 'react-router-dom';
import { createMemoryHistory } from 'history';

import { Formik } from 'formik';
import { CredentialsAPI, CredentialTypesAPI } from 'api';
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
    const params = {
      id: 51,
      templateType,
    };
    return renderWithContexts(
      <Route path="templates/:templateType/:id/edit">
        <Formik initialValues={values}>
          <WebhookSubForm templateType={templateType} />
        </Formik>
      </Route>,
      {
        context: {
          router: {
            history,
            route: {
              location: { pathname },
              match: { params },
            },
          },
        },
      }
    );
  };

  beforeEach(async () => {
    history = createMemoryHistory({
      initialEntries: ['templates/job_template/51/edit'],
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
    expect(
      screen.getByLabelText('workflow job template webhook key')
    ).toHaveValue('A NEW WEBHOOK KEY WILL BE GENERATED ON SAVE.');
  });

  test('should have disabled button to update webhook key', async () => {
    renderForm(
      {
        ...initialValues,
        webhook_key: 'A NEW WEBHOOK KEY WILL BE GENERATED ON SAVE.',
      },
      'job_template',
      'templates/job_template/51/edit'
    );

    expect(
      await screen.findByRole('button', { name: 'Update webhook key' })
    ).toBeDisabled();
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
});
