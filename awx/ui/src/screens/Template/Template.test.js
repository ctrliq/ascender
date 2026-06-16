import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { JobTemplatesAPI, OrganizationsAPI } from 'api';

import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Template from './Template';
import mockJobTemplateData from './shared/data.job_template.json';

jest.mock('../../api/models/JobTemplates');
jest.mock('../../api/models/Organizations');

const mockMe = {
  is_super_user: true,
  is_system_auditor: false,
};
describe('<Template />', () => {
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
    renderWithContexts(<Template setBreadcrumb={() => {}} me={mockMe} />);
    await waitFor(() => expect(JobTemplatesAPI.readDetail).toHaveBeenCalled());
  });
  test('When component mounts API is called and the response is put in state', async () => {
    renderWithContexts(<Template setBreadcrumb={() => {}} me={mockMe} />);
    await waitFor(() => expect(JobTemplatesAPI.readDetail).toHaveBeenCalled());
    expect(OrganizationsAPI.read).toHaveBeenCalled();
  });
  test('notifications tab shown for admins', async () => {
    renderWithContexts(<Template setBreadcrumb={() => {}} me={mockMe} />);

    await waitFor(() =>
      expect(screen.getAllByRole('tab')).toHaveLength(7)
    );
    expect(
      screen.getByRole('tab', { name: 'Notifications' })
    ).toBeInTheDocument();
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

    renderWithContexts(<Template setBreadcrumb={() => {}} me={mockMe} />);
    await waitFor(() =>
      expect(screen.getAllByRole('tab')).toHaveLength(6)
    );
    expect(
      screen.queryByRole('tab', { name: 'Notifications' })
    ).not.toBeInTheDocument();
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/templates/job_template/1/foobar'],
    });

    renderWithContexts(<Template setBreadcrumb={() => {}} me={mockMe} />, {
      context: {
        router: {
          history,
          route: {
            location: history.location,
            match: {
              params: { id: 1 },
              url: '/templates/job_template/1/foobar',
              path: '/templates/job_template/1/foobar',
            },
          },
        },
      },
    });

    expect(
      await screen.findByText('Not Found')
    ).toBeInTheDocument();
  });
  test('should call to get webhook key', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/templates/job_template/1/foobar'],
    });
    renderWithContexts(<Template setBreadcrumb={() => {}} me={mockMe} />, {
      context: {
        router: {
          history,
          route: {
            location: history.location,
            match: {
              params: { id: 1 },
              url: '/templates/job_template/1/foobar',
              path: '/templates/job_template/1/foobar',
            },
          },
        },
      },
    });
    await waitFor(() =>
      expect(JobTemplatesAPI.readWebhookKey).toHaveBeenCalled()
    );
  });
  test('should not call to get webhook key', async () => {
    JobTemplatesAPI.readTemplateOptions.mockResolvedValueOnce({
      data: {
        actions: {},
      },
    });

    const history = createMemoryHistory({
      initialEntries: ['/templates/job_template/1/foobar'],
    });
    renderWithContexts(<Template setBreadcrumb={() => {}} me={mockMe} />, {
      context: {
        router: {
          history,
          route: {
            location: history.location,
            match: {
              params: { id: 1 },
              url: '/templates/job_template/1/foobar',
              path: '/templates/job_template/1/foobar',
            },
          },
        },
      },
    });
    await waitFor(() => expect(JobTemplatesAPI.readDetail).toHaveBeenCalled());
    expect(JobTemplatesAPI.readWebhookKey).not.toHaveBeenCalled();
  });
});
