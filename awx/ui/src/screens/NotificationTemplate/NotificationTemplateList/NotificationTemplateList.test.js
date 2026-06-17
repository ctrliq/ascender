import React from 'react';
import { screen, waitFor, fireEvent, act } from '@testing-library/react';

import { NotificationsAPI, NotificationTemplatesAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import NotificationTemplateList from './NotificationTemplateList';

jest.mock('../../../api');

const mockTemplates = {
  data: {
    count: 3,
    results: [
      {
        name: 'Boston',
        id: 1,
        url: '/notification_templates/1',
        type: 'slack',
        summary_fields: {
          organization: { id: 1, name: 'Foo' },
          recent_notifications: [{ status: 'success' }],
          user_capabilities: { delete: true, edit: true },
        },
      },
      {
        name: 'Minneapolis',
        id: 2,
        url: '/notification_templates/2',
        summary_fields: {
          organization: { id: 2, name: 'Bar' },
          recent_notifications: [],
          user_capabilities: { delete: true, edit: true },
        },
      },
      {
        name: 'Philidelphia',
        id: 3,
        url: '/notification_templates/3',
        summary_fields: {
          organization: { id: 3, name: 'Test' },
          recent_notifications: [{ status: 'failed' }, { status: 'success' }],
          user_capabilities: { delete: true, edit: true },
        },
      },
    ],
  },
};

describe('<NotificationTemplateList />', () => {
  beforeEach(() => {
    NotificationTemplatesAPI.read.mockResolvedValue(mockTemplates);
    NotificationTemplatesAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {}, POST: {} } },
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('should load notifications', async () => {
    renderWithContexts(<NotificationTemplateList />);
    expect(await screen.findByText('Boston')).toBeInTheDocument();
    expect(screen.getByText('Minneapolis')).toBeInTheDocument();
    expect(screen.getByText('Philidelphia')).toBeInTheDocument();
    expect(NotificationTemplatesAPI.read).toHaveBeenCalledTimes(1);
  });

  test('should select a row', async () => {
    const { user } = renderWithContexts(<NotificationTemplateList />);
    await screen.findByText('Boston');
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[1]).not.toBeChecked();
    await user.click(checkboxes[1]);
    expect(checkboxes[1]).toBeChecked();
  });

  test('should delete notifications', async () => {
    const { user } = renderWithContexts(<NotificationTemplateList />);
    await screen.findByText('Boston');
    await user.click(screen.getAllByRole('checkbox')[0]); // select all
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByLabelText('confirm delete'));
    await waitFor(() =>
      expect(NotificationTemplatesAPI.destroy).toHaveBeenCalledTimes(3)
    );
    await waitFor(() =>
      expect(NotificationTemplatesAPI.read).toHaveBeenCalledTimes(2)
    );
  });

  test('should show an error dialog for a failed deletion', async () => {
    NotificationTemplatesAPI.destroy.mockRejectedValue(new Error('nope'));
    const { user } = renderWithContexts(<NotificationTemplateList />);
    await screen.findByText('Boston');
    await user.click(screen.getAllByRole('checkbox')[1]);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByLabelText('confirm delete'));
    expect(await screen.findByText('Error!')).toBeInTheDocument();
  });

  test('should show the add button', async () => {
    renderWithContexts(<NotificationTemplateList />);
    await screen.findByText('Boston');
    expect(screen.getByRole('link', { name: 'Add' })).toBeInTheDocument();
  });

  test('should hide the add button without POST capability', async () => {
    NotificationTemplatesAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} } },
    });
    renderWithContexts(<NotificationTemplateList />);
    await screen.findByText('Boston');
    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
  });

  test('should show a toast after a test notification resolves', async () => {
    jest.useFakeTimers();
    NotificationTemplatesAPI.test.mockResolvedValue({
      data: { notification: 9182 },
    });
    NotificationsAPI.readDetail.mockResolvedValue({
      data: {
        id: 9182,
        status: 'failed',
        error: 'There was an error with the notification',
        summary_fields: { notification_template: { name: 'foobar' } },
      },
    });

    renderWithContexts(<NotificationTemplateList />);
    // wait for the list rows/actions to render before interacting
    await screen.findByText('Boston');

    expect(screen.queryByText('foobar')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Test Notification' })[0]
    );

    // runAllTimersAsync flushes the microtask queue between timers, so the
    // test() -> setTimeout(poll) -> readDetail() -> onAddToast chain resolves.
    await act(async () => {
      await jest.runAllTimersAsync();
    });

    // the toast carries the notification template name as its title
    expect(NotificationsAPI.readDetail).toHaveBeenCalledWith(9182);
    expect(screen.getByText('foobar')).toBeInTheDocument();
    jest.useRealTimers();
  });
});
