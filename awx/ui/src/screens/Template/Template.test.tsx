import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { JobTemplatesAPI, OrganizationsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';

import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Template from './Template';
import mockJobTemplateData from './shared/data.job_template.json';

vi.mock('../../api/models/JobTemplates');
vi.mock('../../api/models/Organizations');

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
  return renderWithContexts(
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
  beforeEach(() => {
    vi.mocked(JobTemplatesAPI.readDetail).mockResolvedValue({
      data: { ...mockJobTemplateData, survey_enabled: false },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readDetail>);
    vi.mocked(JobTemplatesAPI.readTemplateOptions).mockResolvedValue({
      data: {
        actions: { PUT: true },
      },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readTemplateOptions>);
    vi.mocked(JobTemplatesAPI.readCredentials).mockResolvedValue({
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
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readCredentials>);
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [{ id: 1 }],
      },
    } as unknown as ResponseOf<typeof OrganizationsAPI.read>);
    vi.mocked(JobTemplatesAPI.readLaunch).mockResolvedValue({
      data: {},
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readLaunch>);
    vi.mocked(JobTemplatesAPI.readWebhookKey).mockResolvedValue({
      data: { webhook_key: 'key' },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readWebhookKey>);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    renderTemplate();
    await waitFor(() => expect(JobTemplatesAPI.readDetail).toHaveBeenCalled());
  });

  test('When component mounts API is called and the response is put in state', async () => {
    renderTemplate();
    await waitFor(() => expect(JobTemplatesAPI.readDetail).toHaveBeenCalled());
    expect(OrganizationsAPI.read).toHaveBeenCalled();
  });

  test('notifications tab shown for admins', async () => {
    renderTemplate();
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(7));
    expect(
      screen.getByRole('tab', { name: 'Notifications' })
    ).toBeInTheDocument();
  });

  test('notifications tab hidden with reduced permissions', async () => {
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [] },
    } as unknown as ResponseOf<typeof OrganizationsAPI.read>);
    renderTemplate();
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(6));
    expect(
      screen.queryByRole('tab', { name: 'Notifications' })
    ).not.toBeInTheDocument();
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    renderTemplate('/templates/job_template/1/foobar');
    expect(await screen.findByText('Not Found')).toBeInTheDocument();
  });

  test('should call to get webhook key', async () => {
    renderTemplate('/templates/job_template/1/foobar');
    await waitFor(() =>
      expect(JobTemplatesAPI.readWebhookKey).toHaveBeenCalled()
    );
  });

  test('should not call to get webhook key', async () => {
    vi.mocked(JobTemplatesAPI.readTemplateOptions).mockResolvedValueOnce({
      data: { actions: {} },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.readTemplateOptions>);
    renderTemplate('/templates/job_template/1/foobar');
    await waitFor(() => expect(JobTemplatesAPI.readDetail).toHaveBeenCalled());
    expect(JobTemplatesAPI.readWebhookKey).not.toHaveBeenCalled();
  });
});
