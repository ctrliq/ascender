import React from 'react';
import { createMemoryHistory } from 'history';
import { act } from 'react-dom/test-utils';
import { JobTemplatesAPI, OrganizationsAPI } from 'api';

import { Routes, Route } from 'react-router-dom-v5-compat';
import {
  mountWithContexts,
  waitForElement,
} from '../../../testUtils/enzymeHelpers';
import Template from './Template';
import mockJobTemplateData from './shared/data.job_template.json';

jest.mock('../../api/models/JobTemplates');
jest.mock('../../api/models/Organizations');

const mockMe = {
  is_super_user: true,
  is_system_auditor: false,
};

// Template is a v6 descendant mounted by Templates at job_template/:id/*, so it
// reads :id from the route. Mount it under the same real v6 route here; the
// default /foobar subpath hits Template's not-found branch (only tabs render,
// no detail subcomponent fetches).
function renderTemplate(entry = '/templates/job_template/1/foobar') {
  const history = createMemoryHistory({ initialEntries: [entry] });
  return mountWithContexts(
    <Routes>
      <Route
        path="/templates/job_template/:id/*"
        element={<Template setBreadcrumb={() => {}} me={mockMe} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<Template />', () => {
  let wrapper;
  beforeEach(() => {
    JobTemplatesAPI.readDetail.mockResolvedValue({
      data: { ...mockJobTemplateData, survey_enabled: false },
    });
    JobTemplatesAPI.readTemplateOptions.mockResolvedValue({
      data: {
        actions: { PUT: true },
      },
    });
    JobTemplatesAPI.readCredentials.mockResolvedValue({
      data: {
        results: [
          {
            id: 3,
            type: 'credential',
            url: '/api/v2/credentials/3/',
            name: 'Vault1Id1',
            inputs: {
              vault_id: '1',
            },
            kind: 'vault',
          },
        ],
      },
    });
    OrganizationsAPI.read.mockResolvedValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
          },
        ],
      },
    });
    JobTemplatesAPI.readLaunch.mockResolvedValue({ data: {} });
    JobTemplatesAPI.readWebhookKey.mockResolvedValue({
      data: {
        webhook_key: 'key',
      },
    });
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  test('initially renders successfully', async () => {
    await act(async () => {
      wrapper = renderTemplate();
    });
  });
  test('When component mounts API is called and the response is put in state', async () => {
    await act(async () => {
      wrapper = renderTemplate();
    });
    expect(JobTemplatesAPI.readDetail).toHaveBeenCalled();
    expect(OrganizationsAPI.read).toHaveBeenCalled();
  });
  test('notifications tab shown for admins', async () => {
    await act(async () => {
      wrapper = renderTemplate();
    });

    const tabs = await waitForElement(
      wrapper,
      '.pf-c-tabs__item',
      (el) => el.length === 7
    );
    expect(tabs.at(3).text()).toEqual('Notifications');
  });
  test('notifications tab hidden with reduced permissions', async () => {
    OrganizationsAPI.read.mockResolvedValue({
      data: {
        count: 0,
        next: null,
        previous: null,
        results: [],
      },
    });

    await act(async () => {
      wrapper = renderTemplate();
    });
    const tabs = await waitForElement(
      wrapper,
      '.pf-c-tabs__item',
      (el) => el.length === 6
    );
    tabs.forEach((tab) => expect(tab.text()).not.toEqual('Notifications'));
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    await act(async () => {
      wrapper = renderTemplate('/templates/job_template/1/foobar');
    });

    await waitForElement(wrapper, 'ContentError', (el) => el.length === 1);
  });
  test('should call to get webhook key', async () => {
    await act(async () => {
      wrapper = renderTemplate('/templates/job_template/1/foobar');
    });
    expect(JobTemplatesAPI.readWebhookKey).toHaveBeenCalled();
  });
  test('should not call to get webhook key', async () => {
    JobTemplatesAPI.readTemplateOptions.mockResolvedValueOnce({
      data: {
        actions: {},
      },
    });

    await act(async () => {
      wrapper = renderTemplate('/templates/job_template/1/foobar');
    });
    expect(JobTemplatesAPI.readWebhookKey).not.toHaveBeenCalled();
  });
});
