import React from 'react';
import { screen, waitFor, act } from '@testing-library/react';

import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import NotificationTemplateForm from './NotificationTemplateForm';

jest.mock('../../../api/models/NotificationTemplates');
jest.mock('../../../api/models/Organizations');

// react-ace (CodeEditor) does not expose its value as queryable text in jsdom,
// so render the editor value as plain text to allow content assertions. The
// custom-message fields use CodeEditorField, which is rendered from its formik
// field value.
jest.mock('components/CodeEditor', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    ...jest.requireActual('components/CodeEditor'),
    default: ({ value }) => ReactLib.createElement('div', null, value),
  };
});
jest.mock('components/CodeEditor/CodeEditorField', () => {
  const ReactLib = require('react');
  const { useField } = require('formik');
  return {
    __esModule: true,
    default: ({ name }) => {
      const [field] = useField(name);
      return ReactLib.createElement('div', null, field.value);
    },
  };
});

const template = {
  id: 3,
  notification_type: 'slack',
  name: 'Test Notification',
  description: 'a sample notification',
  url: '/notification_templates/3',
  organization: 1,
  summary_fields: {
    user_capabilities: { edit: true },
    recent_notifications: [{ status: 'success' }],
    organization: { id: 1, name: 'The Organization' },
  },
};

const emailTemplate = {
  ...template,
  notification_type: 'email',
  notification_configuration: {
    host: 'smtp.example.com',
    port: 587,
    recipients: ['ops@example.com'],
    sender: 'alerts@example.com',
    timeout: 30,
    password: '$encrypted$',
    username: 'smtp-user',
    use_ssl: false,
    use_tls: false,
  },
};

const messageDef = { message: 'default message', body: 'default body' };
const defaults = {
  started: messageDef,
  success: messageDef,
  error: messageDef,
  workflow_approval: {
    approved: messageDef,
    denied: messageDef,
    running: messageDef,
    timed_out: messageDef,
  },
};
const defaultMessages = { email: defaults, slack: defaults, twilio: defaults };
const allDefaultMessages = {
  ...defaultMessages,
  grafana: defaults,
  irc: defaults,
  mattermost: defaults,
  pagerduty: defaults,
  rocketchat: defaults,
  webhook: defaults,
};

const buildTemplate = (notificationType, notificationConfiguration) => ({
  ...template,
  notification_type: notificationType,
  notification_configuration: notificationConfiguration,
});

const secretTemplates = [
  {
    type: 'grafana',
    fieldName: 'notification_configuration.grafana_key',
    template: buildTemplate('grafana', {
      grafana_url: 'https://grafana.example.com',
      grafana_key: '$encrypted$',
      dashboardId: '',
      panelId: '',
      annotation_tags: [],
      grafana_no_verify_ssl: false,
    }),
  },
  {
    type: 'irc',
    fieldName: 'notification_configuration.password',
    template: buildTemplate('irc', {
      password: '$encrypted$',
      port: 6667,
      server: 'irc.example.com',
      nickname: 'awx',
      targets: ['#alerts'],
      use_ssl: false,
    }),
  },
  {
    type: 'pagerduty',
    fieldName: 'notification_configuration.token',
    template: buildTemplate('pagerduty', {
      token: '$encrypted$',
      subdomain: 'example',
      service_key: 'service-key',
      client_name: 'awx',
    }),
  },
  {
    type: 'slack',
    fieldName: 'notification_configuration.token',
    template: buildTemplate('slack', {
      channels: ['#alerts'],
      token: '$encrypted$',
      hex_color: '',
    }),
  },
  {
    type: 'twilio',
    fieldName: 'notification_configuration.account_token',
    template: buildTemplate('twilio', {
      account_token: '$encrypted$',
      from_number: '+18005550199',
      to_numbers: ['+11231231234'],
      account_sid: 'AC123',
    }),
  },
  {
    type: 'webhook',
    fieldName: 'notification_configuration.password',
    template: buildTemplate('webhook', {
      username: 'service-user',
      password: '$encrypted$',
      url: 'https://example.com/webhook',
      disable_ssl_verification: false,
      headers: {},
      http_method: 'POST',
    }),
  },
];

const renderForm = (props = {}) =>
  renderWithContexts(
    <NotificationTemplateForm
      template={template}
      defaultMessages={defaultMessages}
      detailUrl="/notification_templates/3/detail"
      onSubmit={jest.fn()}
      onCancel={jest.fn()}
      {...props}
    />
  );

describe('<NotificationTemplateForm />', () => {
  test('should render fields and reveal email options on type change', async () => {
    const { container, user } = renderForm();
    expect(container.querySelector('#notification-name')).toHaveValue(
      'Test Notification'
    );
    expect(container.querySelector('#notification-description')).toHaveValue(
      'a sample notification'
    );
    expect(screen.getByDisplayValue('The Organization')).toBeInTheDocument();
    expect(container.querySelector('#notification-type')).toHaveValue('slack');
    expect(container.querySelector('#option-use-ssl')).toBeNull();
    expect(container.querySelector('#option-use-tls')).toBeNull();

    await user.selectOptions(
      container.querySelector('#notification-type'),
      'email'
    );

    await waitFor(() =>
      expect(container.querySelector('#option-use-ssl')).toBeInTheDocument()
    );
    expect(container.querySelector('#option-use-tls')).toBeInTheDocument();
  });

  test('should render existing custom messages', async () => {
    await act(async () => {
      renderForm({
        template: {
          ...template,
          messages: { started: { message: 'Started', body: null } },
        },
      });
    });
    expect(screen.getByText('Started')).toBeInTheDocument();
  });

  test('should submit the assembled values', async () => {
    const onSubmit = jest.fn();
    const { user } = renderForm({
      template: {
        ...template,
        notification_configuration: { channels: ['#foo'], token: 'abc123' },
      },
      onSubmit,
    });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Test Notification',
        description: 'a sample notification',
        organization: 1,
        notification_type: 'slack',
        notification_configuration: {
          channels: ['#foo'],
          hex_color: '',
          token: 'abc123',
        },
        messages: null,
      })
    );
  });

  test('should clear the email password when reverted', async () => {
    const onSubmit = jest.fn();
    const { container, user } = renderForm({
      template: emailTemplate,
      onSubmit,
    });

    await user.click(
      container.querySelector(
        '[data-ouia-component-id="notification_configuration.password-revert"]'
      )
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          notification_configuration: expect.objectContaining({
            password: '',
          }),
        })
      )
    );
  });

  test.each(secretTemplates)(
    'should clear the $type secret when reverted',
    async ({ template: secretTemplate, fieldName }) => {
      const onSubmit = jest.fn();
      const { container, user } = renderForm({
        template: secretTemplate,
        defaultMessages: allDefaultMessages,
        onSubmit,
      });

      const revertButton = container.querySelector(
        `[data-ouia-component-id="${fieldName}-revert"]`
      );
      expect(revertButton).not.toBeNull();

      await user.click(revertButton);
      await user.click(screen.getByRole('button', { name: 'Save' }));

      const key = fieldName.split('.').pop();
      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            notification_configuration: expect.objectContaining({
              [key]: '',
            }),
          })
        )
      );
    }
  );
});
