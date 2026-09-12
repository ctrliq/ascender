import type { NotificationTemplate } from 'types/api';
import React from 'react';
import { screen } from '@testing-library/react';
import type { DefaultMessages } from '../shared/NotificationTemplateForm';

import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import NotificationTemplateDetail from './NotificationTemplateDetail';
import defaultMessagesJson from '../shared/notification-template-default-messages.json';

/** The fixtures as the detail takes them, which is what the api sends. */
const defaultMessages = defaultMessagesJson as unknown as DefaultMessages;

vi.mock('../../../api');

const mockTemplate = {
  id: 1,
  type: 'notification_template',
  url: '/api/v2/notification_templates/1/',
  related: {
    named_url: '/api/v2/notification_templates/abc++Default/',
    created_by: '/api/v2/users/2/',
    modified_by: '/api/v2/users/2/',
    test: '/api/v2/notification_templates/1/test/',
    notifications: '/api/v2/notification_templates/1/notifications/',
    copy: '/api/v2/notification_templates/1/copy/',
    organization: '/api/v2/organizations/1/',
  },
  summary_fields: {
    organization: { id: 1, name: 'Default', description: '' },
    created_by: { id: 2, username: 'test', first_name: '', last_name: '' },
    modified_by: { id: 2, username: 'test', first_name: '', last_name: '' },
    user_capabilities: { edit: true, delete: true, copy: true },
    recent_notifications: [{ status: 'success' }],
  },
  created: '2021-06-16T18:52:23.811374Z',
  modified: '2021-06-16T18:53:37.631371Z',
  name: 'abc',
  description: 'foo description',
  organization: 1,
  notification_type: 'email',
  notification_configuration: {
    username: '',
    password: '',
    host: 'https://localhost',
    recipients: ['foo@ansible.com'],
    sender: 'bar@ansible.com',
    port: 324,
    timeout: 11,
    use_ssl: true,
    use_tls: true,
  },
  messages: null,
};

describe('<NotificationTemplateDetail />', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const assertCommonDetails = async () => {
    expect(await screen.findByText('Name')).toBeInTheDocument();
    assertDetail('Name', mockTemplate.name);
    assertDetail('Description', mockTemplate.description);
    // Email Options renders the SSL/TLS flags as list items
    expect(screen.getByText('Use SSL')).toBeInTheDocument();
    expect(screen.getByText('Use TLS')).toBeInTheDocument();
  };

  test('should render Details', async () => {
    renderWithContexts(
      <NotificationTemplateDetail
        template={mockTemplate as unknown as NotificationTemplate}
        defaultMessages={defaultMessages}
      />
    );
    await assertCommonDetails();
  });

  test('should render Details when defaultMessages is missing', async () => {
    renderWithContexts(
      <NotificationTemplateDetail
        template={mockTemplate as unknown as NotificationTemplate}
        defaultMessages={null as unknown as DefaultMessages}
      />
    );
    await assertCommonDetails();
  });
});
