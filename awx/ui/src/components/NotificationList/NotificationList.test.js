import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { NotificationTemplatesAPI, JobTemplatesAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import NotificationList from './NotificationList';

jest.mock('../../api');

describe('<NotificationList />', () => {
  let container;
  let user;
  const data = {
    count: 2,
    results: [
      {
        id: 1,
        name: 'Notification one',
        url: '/api/v2/notification_templates/1/',
        notification_type: 'email',
      },
      {
        id: 2,
        name: 'Notification two',
        url: '/api/v2/notification_templates/2/',
        notification_type: 'email',
      },
      {
        id: 3,
        name: 'Notification three',
        url: '/api/v2/notification_templates/3/',
        notification_type: 'email',
      },
    ],
  };

  // The PF Switch renders the toggle as an <input type="checkbox" id={...}>;
  // toggles share aria-labels across rows, so query the underlying input by
  // its stable id to disambiguate per row.
  const toggle = (id) => container.querySelector(`#${id}`);

  beforeEach(async () => {
    NotificationTemplatesAPI.readOptions.mockReturnValue({
      data: {
        actions: {
          GET: {
            notification_type: {
              choices: [['email', 'Email']],
            },
          },
        },
      },
    });

    NotificationTemplatesAPI.read.mockReturnValue({ data });

    JobTemplatesAPI.readNotificationTemplatesSuccess.mockReturnValue({
      data: { results: [{ id: 1 }] },
    });

    JobTemplatesAPI.readNotificationTemplatesError.mockReturnValue({
      data: { results: [{ id: 2 }] },
    });

    JobTemplatesAPI.readNotificationTemplatesStarted.mockReturnValue({
      data: { results: [{ id: 3 }] },
    });

    ({ container, user } = renderWithContexts(
      <NotificationList id={1} canToggleNotifications apiModel={JobTemplatesAPI} />
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
    JobTemplatesAPI.associateNotificationTemplate.mockRejectedValue(
      new Error({
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
});
