import type { Untyped } from 'types/api';
import type { ApiResponse } from 'api/Base';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import {
  WorkflowJobTemplatesAPI,
  OrganizationsAPI,
  NotificationTemplatesAPI,
} from 'api';

import { renderWithContexts } from '../../../testUtils/rtlContexts';
import WorkflowJobTemplate from './WorkflowJobTemplate';
import mockWorkflowJobTemplateData from './shared/data.workflow_job_template.json';

vi.mock('../../api');

const mockMe = {
  is_super_user: true,
  is_system_auditor: false,
};

// WorkflowJobTemplate is a v6 descendant mounted by Templates at
// workflow_job_template/:id/*; mount it under the same real v6 route so it
// reads :id and its relative child routes resolve.
function renderWFJT(
  entry = '/templates/workflow_job_template/1/foobar',
  me: Untyped = mockMe
) {
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
    vi.mocked(WorkflowJobTemplatesAPI.readDetail).mockResolvedValue({
      data: { ...mockWorkflowJobTemplateData, survey_enabled: false },
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(
      WorkflowJobTemplatesAPI.readWorkflowJobTemplateOptions
    ).mockResolvedValue({
      data: { actions: { PUT: true } },
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [{ id: 1 }],
      },
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(WorkflowJobTemplatesAPI.readLaunch).mockResolvedValue({
      data: {},
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(WorkflowJobTemplatesAPI.readWebhookKey).mockResolvedValue({
      data: { webhook_key: 'key' },
    } as unknown as ApiResponse<Untyped>);
  });

  afterEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [] },
    } as unknown as ApiResponse<Untyped>);
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
    vi.mocked(
      WorkflowJobTemplatesAPI.readWorkflowJobTemplateOptions
    ).mockResolvedValueOnce({
      data: { actions: {} },
    } as unknown as ApiResponse<Untyped>);
    renderWFJT('/templates/workflow_job_template/1/foobar');
    await waitFor(() =>
      expect(WorkflowJobTemplatesAPI.readDetail).toHaveBeenCalled()
    );
    expect(WorkflowJobTemplatesAPI.readWebhookKey).not.toHaveBeenCalled();
  });

  test('should render workflow notifications list view', async () => {
    vi.mocked(
      WorkflowJobTemplatesAPI.readNotificationTemplatesSuccess
    ).mockResolvedValue({
      data: { results: [{ id: 1 }] },
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(
      WorkflowJobTemplatesAPI.readNotificationTemplatesError
    ).mockResolvedValue({
      data: { results: [{ id: 2 }] },
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(
      WorkflowJobTemplatesAPI.readNotificationTemplatesStarted
    ).mockResolvedValue({
      data: { results: [{ id: 3 }] },
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(
      WorkflowJobTemplatesAPI.readNotificationTemplatesApprovals
    ).mockResolvedValue({
      data: { results: [{ id: 4 }] },
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(NotificationTemplatesAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: { notification_type: { choices: [['email', 'Email']] } },
        },
      },
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(NotificationTemplatesAPI.read).mockResolvedValue({
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
    } as unknown as ApiResponse<Untyped>);
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
