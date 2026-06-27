import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'routerCompat';
import {
  WorkflowJobTemplatesAPI,
  OrganizationsAPI,
  NotificationTemplatesAPI,
} from 'api';

import { renderWithContexts } from '../../../testUtils/rtlContexts';
import WorkflowJobTemplate from './WorkflowJobTemplate';
import mockWorkflowJobTemplateData from './shared/data.workflow_job_template.json';

jest.mock('../../api');

const mockMe = {
  is_super_user: true,
  is_system_auditor: false,
};

// WorkflowJobTemplate is a v6 descendant mounted by Templates at
// workflow_job_template/:id/*; mount it under the same real v6 route so it
// reads :id and its relative child routes resolve.
function renderWFJT(entry = '/templates/workflow_job_template/1/foobar', me = mockMe) {
  const history = createMemoryHistory({ initialEntries: [entry] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/templates/workflow_job_template/:id/*"
        element={<WorkflowJobTemplate setBreadcrumb={() => {}} me={me} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<WorkflowJobTemplate />', () => {
  beforeEach(() => {
    WorkflowJobTemplatesAPI.readDetail.mockResolvedValue({
      data: { ...mockWorkflowJobTemplateData, survey_enabled: false },
    });
    WorkflowJobTemplatesAPI.readWorkflowJobTemplateOptions.mockResolvedValue({
      data: { actions: { PUT: true } },
    });
    OrganizationsAPI.read.mockResolvedValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [{ id: 1 }],
      },
    });
    WorkflowJobTemplatesAPI.readLaunch.mockResolvedValue({ data: {} });
    WorkflowJobTemplatesAPI.readWebhookKey.mockResolvedValue({
      data: { webhook_key: 'key' },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    renderWFJT();
    await waitFor(() =>
      expect(WorkflowJobTemplatesAPI.readDetail).toHaveBeenCalled()
    );
  });

  test('When component mounts API is called and the response is put in state', async () => {
    renderWFJT();
    await waitFor(() =>
      expect(WorkflowJobTemplatesAPI.readDetail).toHaveBeenCalled()
    );
    expect(OrganizationsAPI.read).toHaveBeenCalled();
  });

  test('notifications tab shown for admins', async () => {
    renderWFJT();
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(8));
    expect(
      screen.getByRole('tab', { name: 'Notifications' })
    ).toBeInTheDocument();
  });

  test('notifications tab hidden with reduced permissions', async () => {
    OrganizationsAPI.read.mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [] },
    });
    renderWFJT();
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(7));
    expect(
      screen.queryByRole('tab', { name: 'Notifications' })
    ).not.toBeInTheDocument();
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    renderWFJT('/templates/workflow_job_template/1/foobar');
    expect(await screen.findByText('Not Found')).toBeInTheDocument();
  });

  test('should call to get webhook key', async () => {
    renderWFJT('/templates/workflow_job_template/1/foobar');
    await waitFor(() =>
      expect(WorkflowJobTemplatesAPI.readWebhookKey).toHaveBeenCalled()
    );
  });

  test('should not call to get webhook key', async () => {
    WorkflowJobTemplatesAPI.readWorkflowJobTemplateOptions.mockResolvedValueOnce(
      { data: { actions: {} } }
    );
    renderWFJT('/templates/workflow_job_template/1/foobar');
    await waitFor(() =>
      expect(WorkflowJobTemplatesAPI.readDetail).toHaveBeenCalled()
    );
    expect(WorkflowJobTemplatesAPI.readWebhookKey).not.toHaveBeenCalled();
  });

  test('should render workflow notifications list view', async () => {
    WorkflowJobTemplatesAPI.readNotificationTemplatesSuccess.mockReturnValue({
      data: { results: [{ id: 1 }] },
    });
    WorkflowJobTemplatesAPI.readNotificationTemplatesError.mockReturnValue({
      data: { results: [{ id: 2 }] },
    });
    WorkflowJobTemplatesAPI.readNotificationTemplatesStarted.mockReturnValue({
      data: { results: [{ id: 3 }] },
    });
    WorkflowJobTemplatesAPI.readNotificationTemplatesApprovals.mockReturnValue({
      data: { results: [{ id: 4 }] },
    });
    NotificationTemplatesAPI.readOptions.mockReturnValue({
      data: {
        actions: {
          GET: { notification_type: { choices: [['email', 'Email']] } },
        },
      },
    });
    NotificationTemplatesAPI.read.mockReturnValue({
      data: {
        count: 2,
        results: [
          {
            id: 1,
            name: 'Notification one',
            url: '/api/v2/notification_templates/1/',
            notification_type: 'email',
          },
        ],
      },
    });
    renderWFJT('/templates/workflow_job_template/1/notifications', {
      is_system_auditor: true,
    });
    expect(
      await screen.findByRole('link', { name: 'Notification one' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Toggle notification approvals' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Toggle notification start' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Toggle notification success' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Toggle notification failure' })
    ).toBeInTheDocument();
  });
});
