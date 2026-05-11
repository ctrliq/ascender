import React from 'react';
import { act } from 'react-dom/test-utils';
import { mountWithContexts } from '../../../../testUtils/enzymeHelpers';
import NotificationTemplateForm from './NotificationTemplateForm';

jest.mock('../../../api/models/NotificationTemplates');
jest.mock('../../../api/models/Organizations');

const template = {
  id: 3,
  notification_type: 'slack',
  name: 'Test Notification',
  description: 'a sample notification',
  url: '/notification_templates/3',
  organization: 1,
  summary_fields: {
    user_capabilities: {
      edit: true,
    },
    recent_notifications: [
      {
        status: 'success',
      },
    ],
    organization: {
      id: 1,
      name: 'The Organization',
    },
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

const messageDef = {
  message: 'default message',
  body: 'default body',
};
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
const defaultMessages = {
  email: defaults,
  slack: defaults,
  twilio: defaults,
};

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

describe('<NotificationTemplateForm />', () => {
  let wrapper;
  test('should render form fields', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <NotificationTemplateForm
          template={template}
          defaultMessages={defaultMessages}
          detailUrl="/notification_templates/3/detail"
          onSubmit={jest.fn()}
          onCancel={jest.fn()}
        />
      );
    });

    expect(wrapper.find('input#notification-name').prop('value')).toEqual(
      'Test Notification'
    );
    expect(
      wrapper.find('input#notification-description').prop('value')
    ).toEqual('a sample notification');
    expect(wrapper.find('OrganizationLookup').prop('value')).toEqual({
      id: 1,
      name: 'The Organization',
    });
    expect(wrapper.find('AnsibleSelect').prop('value')).toEqual('slack');
    expect(wrapper.find('TypeInputsSubForm').prop('type')).toEqual('slack');
    expect(wrapper.find('CustomMessagesSubForm').prop('type')).toEqual('slack');
    expect(
      wrapper.find('CustomMessagesSubForm').prop('defaultMessages')
    ).toEqual(defaultMessages);

    expect(wrapper.find('input#option-use-ssl').length).toBe(0);
    expect(wrapper.find('input#option-use-tls').length).toBe(0);

    await act(async () => {
      wrapper.find('AnsibleSelect#notification-type').invoke('onChange')(
        {
          target: {
            name: 'notification_type',
            value: 'email',
          },
        },
        'email'
      );
    });

    wrapper.update();

    expect(wrapper.find('input#option-use-ssl').length).toBe(1);
    expect(wrapper.find('input#option-use-tls').length).toBe(1);
    expect(
      wrapper.find('FormGroup[label="Email Options"]').find('HelpIcon').length
    ).toBe(1);
  });

  test('should render custom messages fields', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <NotificationTemplateForm
          template={{
            ...template,
            messages: {
              started: {
                message: 'Started',
                body: null,
              },
            },
          }}
          defaultMessages={defaultMessages}
          detailUrl="/notification_templates/3/detail"
          onSubmit={jest.fn()}
          onCancel={jest.fn()}
        />
      );
    });

    expect(wrapper.find('CodeEditor').at(0).prop('value')).toEqual('Started');
  });

  test('should submit', async () => {
    const handleSubmit = jest.fn();
    await act(async () => {
      wrapper = mountWithContexts(
        <NotificationTemplateForm
          template={{
            ...template,
            notification_configuration: {
              channels: ['#foo'],
              token: 'abc123',
            },
          }}
          defaultMessages={defaultMessages}
          detailUrl="/notification_templates/3/detail"
          onSubmit={handleSubmit}
          onCancel={jest.fn()}
        />
      );
    });

    await act(async () => {
      wrapper.find('FormActionGroup').invoke('onSubmit')();
    });
    wrapper.update();

    expect(handleSubmit).toHaveBeenCalledWith({
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
    });
  });

  test('should clear the email password when reverted', async () => {
    const handleSubmit = jest.fn();
    await act(async () => {
      wrapper = mountWithContexts(
        <NotificationTemplateForm
          template={emailTemplate}
          defaultMessages={defaultMessages}
          detailUrl="/notification_templates/3/detail"
          onSubmit={handleSubmit}
          onCancel={jest.fn()}
        />
      );
    });

    await act(async () => {
      wrapper
        .find('Button')
        .filterWhere(
          (node) => node.prop('ouiaId') === 'notification_configuration.password-revert'
        )
        .simulate('click');
    });
    wrapper.update();

    await act(async () => {
      wrapper.find('FormActionGroup').invoke('onSubmit')();
    });
    wrapper.update();

    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        notification_configuration: expect.objectContaining({
          password: '',
        }),
      })
    );
  });

  test.each(secretTemplates)(
    'should clear the $type secret when reverted',
    async ({ template: secretTemplate, fieldName }) => {
      const handleSubmit = jest.fn();
      await act(async () => {
        wrapper = mountWithContexts(
          <NotificationTemplateForm
            template={secretTemplate}
            defaultMessages={allDefaultMessages}
            detailUrl="/notification_templates/3/detail"
            onSubmit={handleSubmit}
            onCancel={jest.fn()}
          />
        );
      });

      const revertButton = wrapper
        .find('Button')
        .filterWhere(
          (node) => node.prop('ouiaId') === `${fieldName}-revert`
        );

      expect(revertButton.exists()).toBe(true);

      await act(async () => {
        revertButton.simulate('click');
      });
      wrapper.update();

      await act(async () => {
        wrapper.find('FormActionGroup').invoke('onSubmit')();
      });
      wrapper.update();

      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          notification_configuration: expect.objectContaining({
            [fieldName.split('.').pop()]: '',
          }),
        })
      );
    }
  );
});
