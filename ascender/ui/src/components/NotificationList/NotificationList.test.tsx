import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { NotificationTemplatesAPI, JobTemplatesAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import type { TestUser } from '../../../testUtils/rtlContexts';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import NotificationList from './NotificationList';

vi.mock('../../api');

describe('<NotificationList />', () => {
  let container: HTMLElement;
  let user: TestUser;
  const data = {
    count: 2,
    results: [
      {
        id: 1,
        name: 'Notification one',
        url: '/api/v2/notification_templates/1/',
        notification_type: 'email',
        summary_fields: { user_capabilities: { delete: false } },
      },
      {
        id: 2,
        name: 'Notification two',
        url: '/api/v2/notification_templates/2/',
        notification_type: 'email',
        summary_fields: { user_capabilities: { delete: true } },
      },
      {
        id: 3,
        name: 'Notification three',
        url: '/api/v2/notification_templates/3/',
        notification_type: 'email',
        summary_fields: { user_capabilities: { delete: true } },
      },
    ],
  };

  // The PF Switch renders the toggle as an <input type="checkbox" id={...}>;
  // toggles share aria-labels across rows, so query the underlying input by
  // its stable id to disambiguate per row.
  const toggle = (id: string) =>
    container.querySelector(`#${id}`) as HTMLElement;

  beforeEach(async () => {
    vi.mocked(NotificationTemplatesAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {
            notification_type: {
              choices: [['email', 'Email']],
            },
          },
        },
      },
    } as unknown as ResponseOf<typeof NotificationTemplatesAPI.readOptions>);

    vi.mocked(NotificationTemplatesAPI.read).mockResolvedValue({
      data,
    } as unknown as ResponseOf<typeof NotificationTemplatesAPI.read>);

    vi.mocked(
      JobTemplatesAPI.readNotificationTemplatesSuccess
    ).mockResolvedValue({
      data: { results: [{ id: 1 }] },
    } as unknown as ResponseOf<
      typeof JobTemplatesAPI.readNotificationTemplatesSuccess
    >);

    vi.mocked(JobTemplatesAPI.readNotificationTemplatesError).mockResolvedValue(
      {
        data: { results: [{ id: 2 }] },
      } as unknown as ResponseOf<
        typeof JobTemplatesAPI.readNotificationTemplatesError
      >
    );

    vi.mocked(
      JobTemplatesAPI.readNotificationTemplatesStarted
    ).mockResolvedValue({
      data: { results: [{ id: 3 }] },
    } as unknown as ResponseOf<
      typeof JobTemplatesAPI.readNotificationTemplatesStarted
    >);

    ({ container, user } = renderWithContexts(
      <NotificationList
        id={1}
        canToggleNotifications
        apiModel={JobTemplatesAPI}
      />
    ));

    await waitFor(() =>
      expect(toggle('notification-1-success-toggle')).toBeInTheDocument()
    );
  });

  test('should render list fetched of items', () => {
    expect(NotificationTemplatesAPI.read).toHaveBeenCalled();
    expect(NotificationTemplatesAPI.readOptions).toHaveBeenCalled();
    expect(JobTemplatesAPI.readNotificationTemplatesSuccess).toHaveBeenCalled();
    expect(JobTemplatesAPI.readNotificationTemplatesError).toHaveBeenCalled();
    expect(JobTemplatesAPI.readNotificationTemplatesStarted).toHaveBeenCalled();
    // three notification rows rendered
    expect(container.querySelectorAll('#notification-row-1')).toHaveLength(1);
    expect(container.querySelectorAll('#notification-row-2')).toHaveLength(1);
    expect(container.querySelectorAll('#notification-row-3')).toHaveLength(1);

    expect(toggle('notification-1-success-toggle')).toBeChecked();
    expect(toggle('notification-1-error-toggle')).not.toBeChecked();
    expect(toggle('notification-1-started-toggle')).not.toBeChecked();
    expect(toggle('notification-2-success-toggle')).not.toBeChecked();
    expect(toggle('notification-2-error-toggle')).toBeChecked();
    expect(toggle('notification-2-started-toggle')).not.toBeChecked();
    expect(toggle('notification-3-success-toggle')).not.toBeChecked();
    expect(toggle('notification-3-error-toggle')).not.toBeChecked();
    expect(toggle('notification-3-started-toggle')).toBeChecked();
  });

  test('should enable success notification', async () => {
    expect(toggle('notification-2-success-toggle')).not.toBeChecked();
    await user.click(toggle('notification-2-success-toggle'));
    expect(JobTemplatesAPI.associateNotificationTemplate).toHaveBeenCalledWith(
      1,
      2,
      'success'
    );
    await waitFor(() =>
      expect(toggle('notification-2-success-toggle')).toBeChecked()
    );
  });

  test('should enable error notification', async () => {
    expect(toggle('notification-1-error-toggle')).not.toBeChecked();
    await user.click(toggle('notification-1-error-toggle'));
    expect(JobTemplatesAPI.associateNotificationTemplate).toHaveBeenCalledWith(
      1,
      1,
      'error'
    );
    await waitFor(() =>
      expect(toggle('notification-1-error-toggle')).toBeChecked()
    );
  });

  test('should enable start notification', async () => {
    expect(toggle('notification-1-started-toggle')).not.toBeChecked();
    await user.click(toggle('notification-1-started-toggle'));
    expect(JobTemplatesAPI.associateNotificationTemplate).toHaveBeenCalledWith(
      1,
      1,
      'started'
    );
    await waitFor(() =>
      expect(toggle('notification-1-started-toggle')).toBeChecked()
    );
  });

  test('should disable success notification', async () => {
    expect(toggle('notification-1-success-toggle')).toBeChecked();
    await user.click(toggle('notification-1-success-toggle'));
    expect(
      JobTemplatesAPI.disassociateNotificationTemplate
    ).toHaveBeenCalledWith(1, 1, 'success');
    await waitFor(() =>
      expect(toggle('notification-1-success-toggle')).not.toBeChecked()
    );
  });

  test('should disable error notification', async () => {
    expect(toggle('notification-2-error-toggle')).toBeChecked();
    await user.click(toggle('notification-2-error-toggle'));
    expect(
      JobTemplatesAPI.disassociateNotificationTemplate
    ).toHaveBeenCalledWith(1, 2, 'error');
    await waitFor(() =>
      expect(toggle('notification-2-error-toggle')).not.toBeChecked()
    );
  });

  test('should disable start notification', async () => {
    expect(toggle('notification-3-started-toggle')).toBeChecked();
    await user.click(toggle('notification-3-started-toggle'));
    expect(
      JobTemplatesAPI.disassociateNotificationTemplate
    ).toHaveBeenCalledWith(1, 3, 'started');
    await waitFor(() =>
      expect(toggle('notification-3-started-toggle')).not.toBeChecked()
    );
  });

  test('should throw toggle error', async () => {
    vi.mocked(JobTemplatesAPI.associateNotificationTemplate).mockRejectedValue(
      Object.assign(new Error('An error occurred'), {
        response: {
          config: {
            method: 'post',
          },
          data: 'An error occurred',
          status: 403,
        },
      })
    );
    expect(screen.queryByText('Error!')).not.toBeInTheDocument();
    await user.click(toggle('notification-1-started-toggle'));
    expect(JobTemplatesAPI.associateNotificationTemplate).toHaveBeenCalledWith(
      1,
      1,
      'started'
    );
    // the toggle failure surfaces in the "Error!" AlertModal dialog, which
    // includes the expandable ErrorDetail ("Details" toggle)
    const errorDialog = await screen.findByRole('dialog', { name: /Error!/ });
    expect(within(errorDialog).getByText('Details')).toBeInTheDocument();
  });

  test('deletes the selected notification templates themselves', async () => {
    vi.mocked(NotificationTemplatesAPI.destroy).mockResolvedValue(
      {} as unknown as ResponseOf<typeof NotificationTemplatesAPI.destroy>
    );
    const row = container.querySelector('#notification-row-2') as HTMLElement;

    await user.click(within(row).getByRole('checkbox', { name: /Select row/ }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(
      await screen.findByText(/for every resource that uses them/)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'confirm delete' }));

    await waitFor(() =>
      expect(NotificationTemplatesAPI.destroy).toHaveBeenCalledWith(2)
    );
    expect(NotificationTemplatesAPI.destroy).toHaveBeenCalledTimes(1);
    expect(
      JobTemplatesAPI.disassociateNotificationTemplate
    ).not.toHaveBeenCalled();
  });

  test('refuses to delete a template the viewer may not delete', async () => {
    const row = container.querySelector('#notification-row-1') as HTMLElement;

    await user.click(within(row).getByRole('checkbox', { name: /Select row/ }));

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});

describe('<NotificationList showChangedToggle />', () => {
  let container: HTMLElement;
  let user: TestUser;
  const data = {
    count: 1,
    results: [
      {
        id: 1,
        name: 'Notification one',
        url: '/api/v2/notification_templates/1/',
        notification_type: 'email',
      },
    ],
  };

  const toggle = (id: string) =>
    container.querySelector(`#${id}`) as HTMLElement;

  beforeEach(async () => {
    vi.mocked(NotificationTemplatesAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          GET: {
            notification_type: {
              choices: [['email', 'Email']],
            },
          },
        },
      },
    } as unknown as ResponseOf<typeof NotificationTemplatesAPI.readOptions>);

    vi.mocked(NotificationTemplatesAPI.read).mockResolvedValue({
      data,
    } as unknown as ResponseOf<typeof NotificationTemplatesAPI.read>);

    vi.mocked(
      JobTemplatesAPI.readNotificationTemplatesSuccess
    ).mockResolvedValue({
      data: { results: [] },
    } as unknown as ResponseOf<
      typeof JobTemplatesAPI.readNotificationTemplatesSuccess
    >);

    vi.mocked(JobTemplatesAPI.readNotificationTemplatesError).mockResolvedValue(
      {
        data: { results: [] },
      } as unknown as ResponseOf<
        typeof JobTemplatesAPI.readNotificationTemplatesError
      >
    );

    vi.mocked(
      JobTemplatesAPI.readNotificationTemplatesStarted
    ).mockResolvedValue({
      data: { results: [] },
    } as unknown as ResponseOf<
      typeof JobTemplatesAPI.readNotificationTemplatesStarted
    >);

    vi.mocked(
      JobTemplatesAPI.readNotificationTemplatesChanged
    ).mockResolvedValue({
      data: { results: [{ id: 1 }] },
    } as unknown as ResponseOf<
      typeof JobTemplatesAPI.readNotificationTemplatesChanged
    >);

    ({ container, user } = renderWithContexts(
      <NotificationList
        id={1}
        canToggleNotifications
        apiModel={JobTemplatesAPI}
        showChangedToggle
      />
    ));

    await waitFor(() =>
      expect(toggle('notification-1-changed-toggle')).toBeInTheDocument()
    );
  });

  test('should show the changed toggle as configured', () => {
    expect(JobTemplatesAPI.readNotificationTemplatesChanged).toHaveBeenCalled();
    expect(toggle('notification-1-changed-toggle')).toBeChecked();
  });

  test('should disable changed notification', async () => {
    await user.click(toggle('notification-1-changed-toggle'));
    expect(
      JobTemplatesAPI.disassociateNotificationTemplate
    ).toHaveBeenCalledWith(1, 1, 'changed');
    await waitFor(() =>
      expect(toggle('notification-1-changed-toggle')).not.toBeChecked()
    );
  });
});

describe('<NotificationList /> with no notification templates', () => {
  const renderEmpty = (actions: Record<string, unknown>) => {
    vi.mocked(NotificationTemplatesAPI.readOptions).mockResolvedValue({
      data: { actions },
    } as unknown as ResponseOf<typeof NotificationTemplatesAPI.readOptions>);
    vi.mocked(NotificationTemplatesAPI.read).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof NotificationTemplatesAPI.read>);
    const none = { data: { results: [] } };
    vi.mocked(
      JobTemplatesAPI.readNotificationTemplatesSuccess
    ).mockResolvedValue(
      none as unknown as ResponseOf<
        typeof JobTemplatesAPI.readNotificationTemplatesSuccess
      >
    );
    vi.mocked(JobTemplatesAPI.readNotificationTemplatesError).mockResolvedValue(
      none as unknown as ResponseOf<
        typeof JobTemplatesAPI.readNotificationTemplatesError
      >
    );
    vi.mocked(
      JobTemplatesAPI.readNotificationTemplatesStarted
    ).mockResolvedValue(
      none as unknown as ResponseOf<
        typeof JobTemplatesAPI.readNotificationTemplatesStarted
      >
    );
    return renderWithContexts(
      <NotificationList
        id={1}
        canToggleNotifications
        apiModel={JobTemplatesAPI}
      />
    );
  };

  test('adds one from the toolbar, for somebody who may make one', async () => {
    renderEmpty({ GET: {}, POST: {} });

    expect(await screen.findByRole('link', { name: 'Add' })).toHaveAttribute(
      'href',
      '/notifications/add'
    );
    expect(
      screen.getByText('Add a notification template to enable it here')
    ).toBeInTheDocument();
  });

  test('offers no way to make one to somebody who may not', async () => {
    renderEmpty({ GET: {} });

    expect(
      await screen.findByText('Notification templates you can use appear here')
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
  });
});
