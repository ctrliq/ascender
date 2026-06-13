import React from 'react';
import { act } from 'react-dom/test-utils';
import { Route } from 'react-router-dom';
import { createMemoryHistory } from 'history';

import { Formik } from 'formik';
import { CredentialsAPI, CredentialTypesAPI } from 'api';
import {
  mountWithContexts,
  waitForElement,
} from '../../../../testUtils/enzymeHelpers';

import WebhookSubForm from './WebhookSubForm';

jest.mock('../../../api');

describe('<WebhookSubForm />', () => {
  let wrapper;
  let history;
  const initialValues = {
    webhook_url: '/api/v2/job_templates/51/github/',
    webhook_credential: { id: 1, name: 'Github credential' },
    webhook_service: 'github',
    webhook_key: 'webhook key',
  };

  beforeEach(async () => {
    history = createMemoryHistory({
      initialEntries: ['templates/job_template/51/edit'],
    });
    CredentialsAPI.read.mockResolvedValue({
      data: { results: [{ id: 12, name: 'Github credential' }] },
    });
    await act(async () => {
      wrapper = mountWithContexts(
        <Route path="templates/:templateType/:id/edit">
          <Formik initialValues={initialValues}>
            <WebhookSubForm templateType="job_template" />
          </Formik>
        </Route>,
        {
          context: {
            router: {
              history,
              route: {
                location: { pathname: 'templates/job_template/51/edit' },
                match: { params: { id: 51, templateType: 'job_template' } },
              },
            },
          },
        }
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render initial values properly', () => {
    waitForElement(wrapper, 'Lookup__ChipHolder', (el) => el.lenth > 0);
    expect(wrapper.find('AnsibleSelect').prop('value')).toBe('github');
    expect(
      wrapper.find('TextInputBase[aria-label="Webhook URL"]').prop('value')
    ).toContain('/api/v2/job_templates/51/github/');
    expect(
      wrapper
        .find('TextInputBase[aria-label="workflow job template webhook key"]')
        .prop('value')
    ).toBe('webhook key');
    expect(wrapper.find('input#credential').prop('value')).toBe(
      'Github credential'
    );
  });

  test('should make other credential type available', async () => {
    CredentialsAPI.read.mockResolvedValue({
      data: { results: [{ id: 13, name: 'GitLab credential' }] },
    });
    await act(async () =>
      wrapper.find('AnsibleSelect').prop('onChange')({}, 'gitlab')
    );
    expect(CredentialsAPI.read).toHaveBeenCalledWith({
      namespace: 'gitlab_token',
    });
    wrapper.update();
    expect(
      wrapper.find('TextInputBase[aria-label="Webhook URL"]').prop('value')
    ).toContain('/api/v2/job_templates/51/gitlab/');
    expect(
      wrapper
        .find('TextInputBase[aria-label="workflow job template webhook key"]')
        .prop('value')
    ).toBe('A NEW WEBHOOK KEY WILL BE GENERATED ON SAVE.');
  });

  test('should have disabled button to update webhook key', async () => {
    let newWrapper;
    await act(async () => {
      newWrapper = mountWithContexts(
        <Route path="templates/:templateType/:id/edit">
          <Formik
            initialValues={{
              ...initialValues,
              webhook_key: 'A NEW WEBHOOK KEY WILL BE GENERATED ON SAVE.',
            }}
          >
            <WebhookSubForm templateType="job_template" />
          </Formik>
        </Route>,
        {
          context: {
            router: {
              history,
              route: {
                location: { pathname: 'templates/job_template/51/edit' },
                match: { params: { id: 51, templateType: 'job_template' } },
              },
            },
          },
        }
      );
    });
    expect(
      newWrapper
        .find("Button[aria-label='Update webhook key']")
        .prop('isDisabled')
    ).toBe(true);
  });

  test('test whether the workflow template type is part of the webhook url', async () => {
    let newWrapper;
    const webhook_url = '/api/v2/workflow_job_templates/42/github/';
    await act(async () => {
      newWrapper = mountWithContexts(
        <Route path="templates/:templateType/:id/edit">
          <Formik initialValues={{ ...initialValues, webhook_url }}>
            <WebhookSubForm templateType="workflow_job_template" />
          </Formik>
        </Route>,
        {
          context: {
            router: {
              history,
              route: {
                location: {
                  pathname: 'templates/workflow_job_template/51/edit',
                },
                match: {
                  params: { id: 51, templateType: 'workflow_job_template' },
                },
              },
            },
          },
        }
      );
    });
    expect(
      newWrapper.find('TextInputBase[aria-label="Webhook URL"]').prop('value')
    ).toContain(webhook_url);
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
    let newWrapper;
    await act(async () => {
      newWrapper = mountWithContexts(
        <Route path="templates/:templateType/:id/edit">
          <Formik initialValues={initialValues}>
            <WebhookSubForm templateType="job_template" />
          </Formik>
        </Route>,
        {
          context: {
            router: {
              history,
              route: {
                location: { pathname: 'templates/job_template/51/edit' },
                match: { params: { id: 51, templateType: 'job_template' } },
              },
            },
          },
        }
      );
    });
    await waitForElement(newWrapper, 'ContentLoading', (el) => el.length === 0);
    expect(newWrapper.find('CredentialLookup')).toHaveLength(1);
    expect(
      newWrapper.find('Alert[ouiaId="webhook-credential-type-missing"]')
    ).toHaveLength(0);
  });

  test('should warn instead of failing silently when no credential type is found', async () => {
    CredentialTypesAPI.read.mockResolvedValue({ data: { results: [] } });
    let newWrapper;
    await act(async () => {
      newWrapper = mountWithContexts(
        <Route path="templates/:templateType/:id/edit">
          <Formik initialValues={initialValues}>
            <WebhookSubForm templateType="job_template" />
          </Formik>
        </Route>,
        {
          context: {
            router: {
              history,
              route: {
                location: { pathname: 'templates/job_template/51/edit' },
                match: { params: { id: 51, templateType: 'job_template' } },
              },
            },
          },
        }
      );
    });
    await waitForElement(newWrapper, 'ContentLoading', (el) => el.length === 0);
    expect(newWrapper.find('CredentialLookup')).toHaveLength(0);
    expect(
      newWrapper.find('Alert[ouiaId="webhook-credential-type-missing"]')
    ).toHaveLength(1);
  });
});
