import React from 'react';
import { screen, waitFor } from '@testing-library/react';

import { NotificationTemplatesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import NotificationTemplateListItem from './NotificationTemplateListItem';

vi.mock('../../../api/models/NotificationTemplates');
vi.mock('../../../api/models/Notifications');

const template = {
  id: 3,
  notification_type: 'slack',
  name: 'Test Notification',
  summary_fields: {
    organization: { id: 1, name: 'Foo' },
    user_capabilities: { edit: true, copy: true },
    recent_notifications: [{ status: 'success' }],
  },
};

const renderItem = (props = {}) =>
  renderWithContexts(
    <table>
      <tbody>
        <NotificationTemplateListItem
          rowIndex={0}
          template={template}
          onAddToast={vi.fn()}
          fetchTemplates={vi.fn().mockResolvedValue(undefined)}
          detailUrl="/notification_templates/3/detail"
          {...props}
        />
      </tbody>
    </table>
  );

describe('<NotificationTemplateListItem />', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should render template row', () => {
    renderItem();
    expect(screen.getByText('Test Notification')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Slack')).toBeInTheDocument();
  });

  test('should send test notification', async () => {
    vi.mocked(NotificationTemplatesAPI.test).mockResolvedValue({
      data: { notification: 1 },
    } as unknown as ResponseOf<typeof NotificationTemplatesAPI.test>);
    const { user } = renderItem();
    await user.click(screen.getByRole('button', { name: 'Test Notification' }));
    await waitFor(() =>
      expect(NotificationTemplatesAPI.test).toHaveBeenCalledTimes(1)
    );
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  test('should call api to copy template', async () => {
    vi.mocked(NotificationTemplatesAPI.copy).mockResolvedValue({
      name: 'Foo',
    } as unknown as ResponseOf<typeof NotificationTemplatesAPI.copy>);
    const { user } = renderItem();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() =>
      expect(NotificationTemplatesAPI.copy).toHaveBeenCalled()
    );
  });

  test('should render an error modal on copy failure', async () => {
    vi.mocked(NotificationTemplatesAPI.copy).mockRejectedValue(
      new Error('nope')
    );
    const { user } = renderItem();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(
      await screen.findByText('Failed to copy template.')
    ).toBeInTheDocument();
  });

  test('should not render copy button without copy capability', () => {
    renderItem({
      template: {
        ...template,
        summary_fields: {
          organization: { id: 3, name: 'Test' },
          user_capabilities: { copy: false, edit: false },
        },
      },
    });
    expect(
      screen.queryByRole('button', { name: 'Copy' })
    ).not.toBeInTheDocument();
  });
});
