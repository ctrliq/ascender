import React from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { useField } from 'formik';
import { FormGroup, Title } from '@patternfly/react-core';
import {
  FormCheckboxLayout,
  FormColumnLayout,
  FormFullWidthLayout,
  SubFormLayout,
} from 'components/FormLayout';
import FormField, {
  PasswordField,
  CheckboxField,
  ArrayTextField,
} from 'components/FormField';
import AnsibleSelect from 'components/AnsibleSelect';
import { CodeEditorField } from 'components/CodeEditor';
import {
  combine,
  required,
  requiredEmail,
  url,
  minMaxValue,
  twilioPhoneNumber,
} from 'util/validators';
import { NotificationType } from 'types';
import Popover from '../../../components/Popover/Popover';
import getHelpText from './Notifications.helptext';

const TypeFields = {
  email: EmailFields,
  grafana: GrafanaFields,
  irc: IRCFields,
  mattermost: MattermostFields,
  pagerduty: PagerdutyFields,
  rocketchat: RocketChatFields,
  slack: SlackFields,
  twilio: TwilioFields,
  webhook: WebhookFields,
};
function TypeInputsSubForm({ type }) {
  const { i18n } = useLingui();
  const Fields = TypeFields[type];
  return (
    <SubFormLayout>
      <Title size="md" headingLevel="h4">
        {i18n._(msg`Type Details`)}
      </Title>
      <FormColumnLayout>
        <Fields />
      </FormColumnLayout>
    </SubFormLayout>
  );
}
TypeInputsSubForm.propTypes = {
  type: NotificationType.isRequired,
};

export default TypeInputsSubForm;

function EmailFields() {
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  return (
    <>
      <FormField
        id="email-username"
        label={i18n._(msg`Username`)}
        name="notification_configuration.username"
        type="text"
      />
      <PasswordField
        id="email-password"
        label={i18n._(msg`Password`)}
        name="notification_configuration.password"
      />
      <FormField
        id="email-host"
        label={i18n._(msg`Host`)}
        name="notification_configuration.host"
        type="text"
        validate={required(null)}
        isRequired
      />
      <ArrayTextField
        id="email-recipients"
        label={i18n._(msg`Recipient list`)}
        name="notification_configuration.recipients"
        type="textarea"
        validate={required(null)}
        isRequired
        rows={3}
        tooltip={helpText.emailRecepients}
      />
      <FormField
        id="email-sender"
        label={i18n._(msg`Sender e-mail`)}
        name="notification_configuration.sender"
        type="text"
        validate={requiredEmail()}
        isRequired
      />
      <FormField
        id="email-port"
        label={i18n._(msg`Port`)}
        name="notification_configuration.port"
        type="number"
        validate={combine([required(null), minMaxValue(1, 65535)])}
        isRequired
        min="0"
        max="65535"
      />
      <FormField
        id="email-timeout"
        label={i18n._(msg`Timeout`)}
        name="notification_configuration.timeout"
        type="number"
        validate={combine([required(null), minMaxValue(1, 120)])}
        isRequired
        min="1"
        max="120"
        tooltip={helpText.emailTimeout}
      />
      <FormGroup
        fieldId="email-options"
        label={i18n._(msg`Email Options`)}
        labelIcon={<Popover content={helpText.emailOptions} />}
      >
        <FormCheckboxLayout>
          <CheckboxField
            id="option-use-ssl"
            name="notification_configuration.use_ssl"
            label={i18n._(msg`Use SSL`)}
          />
          <CheckboxField
            id="option-use-tls"
            name="notification_configuration.use_tls"
            label={i18n._(msg`Use TLS`)}
          />
        </FormCheckboxLayout>
      </FormGroup>
    </>
  );
}

function GrafanaFields() {
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  return (
    <>
      <FormField
        id="grafana-url"
        label={i18n._(msg`Grafana URL`)}
        name="notification_configuration.grafana_url"
        type="text"
        validate={required(null)}
        isRequired
        tooltip={helpText.grafanaUrl}
      />
      <PasswordField
        id="grafana-key"
        label={i18n._(msg`Grafana API key`)}
        name="notification_configuration.grafana_key"
        validate={required(null)}
        isRequired
      />
      <FormField
        id="grafana-dashboard-id"
        label={i18n._(msg`ID of the dashboard (optional)`)}
        name="notification_configuration.dashboardId"
        type="text"
      />
      <FormField
        id="grafana-panel-id"
        label={i18n._(msg`ID of the panel (optional)`)}
        name="notification_configuration.panelId"
        type="text"
      />
      <ArrayTextField
        id="grafana-tags"
        label={i18n._(msg`Tags for the annotation (optional)`)}
        name="notification_configuration.annotation_tags"
        type="textarea"
        rows={3}
        tooltip={helpText.grafanaTags}
      />
      <CheckboxField
        id="grafana-ssl"
        label={i18n._(msg`Disable SSL verification`)}
        name="notification_configuration.grafana_no_verify_ssl"
      />
    </>
  );
}

function IRCFields() {
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  return (
    <>
      <PasswordField
        id="irc-password"
        label={i18n._(msg`IRC server password`)}
        name="notification_configuration.password"
      />
      <FormField
        id="irc-port"
        label={i18n._(msg`IRC server port`)}
        name="notification_configuration.port"
        type="number"
        validate={required(null)}
        isRequired
        min="0"
      />
      <FormField
        id="irc-server"
        label={i18n._(msg`IRC server address`)}
        name="notification_configuration.server"
        type="text"
        validate={required(null)}
        isRequired
      />
      <FormField
        id="irc-nickname"
        label={i18n._(msg`IRC nick`)}
        name="notification_configuration.nickname"
        type="text"
        validate={required(null)}
        isRequired
      />
      <ArrayTextField
        id="irc-targets"
        label={i18n._(msg`Destination channels or users`)}
        name="notification_configuration.targets"
        type="textarea"
        validate={required(null)}
        isRequired
        tooltip={helpText.ircTargets}
      />
      <CheckboxField
        id="grafana-ssl"
        label={i18n._(msg`Disable SSL verification`)}
        name="notification_configuration.use_ssl"
      />
    </>
  );
}

function MattermostFields() {
  const { i18n } = useLingui();
  return (
    <>
      <FormField
        id="mattermost-url"
        label={i18n._(msg`Target URL`)}
        name="notification_configuration.mattermost_url"
        type="text"
        validate={combine([required(null), url()])}
        isRequired
      />
      <FormField
        id="mattermost-username"
        label={i18n._(msg`Username`)}
        name="notification_configuration.mattermost_username"
        type="text"
      />
      <FormField
        id="mattermost-channel"
        label={i18n._(msg`Channel`)}
        name="notification_configuration.mattermost_channel"
        type="text"
      />
      <FormField
        id="mattermost-icon"
        label={i18n._(msg`Icon URL`)}
        name="notification_configuration.mattermost_icon_url"
        type="text"
        validate={url()}
      />
      <CheckboxField
        id="mattermost-ssl"
        label={i18n._(msg`Disable SSL verification`)}
        name="notification_configuration.mattermost_no_verify_ssl"
      />
    </>
  );
}

function PagerdutyFields() {
  const { i18n } = useLingui();
  return (
    <>
      <PasswordField
        id="pagerduty-token"
        label={i18n._(msg`API Token`)}
        name="notification_configuration.token"
        validate={required(null)}
        isRequired
      />
      <FormField
        id="pagerduty-subdomain"
        label={i18n._(msg`Pagerduty subdomain`)}
        name="notification_configuration.subdomain"
        type="text"
        validate={required(null)}
        isRequired
      />
      <FormField
        id="pagerduty-service-key"
        label={i18n._(msg`API service/integration key`)}
        name="notification_configuration.service_key"
        type="text"
        validate={required(null)}
        isRequired
      />
      <FormField
        id="pagerduty-identifier"
        label={i18n._(msg`Client identifier`)}
        name="notification_configuration.client_name"
        type="text"
        validate={required(null)}
        isRequired
      />
    </>
  );
}

function RocketChatFields() {
  const { i18n } = useLingui();
  return (
    <>
      <FormField
        id="rocketchat-url"
        label={i18n._(msg`Target URL`)}
        name="notification_configuration.rocketchat_url"
        type="text"
        validate={combine([required(null), url()])}
        isRequired
      />
      <FormField
        id="rocketchat-username"
        label={i18n._(msg`Username`)}
        name="notification_configuration.rocketchat_username"
        type="text"
      />
      <FormField
        id="rocketchat-icon-url"
        label={i18n._(msg`Icon URL`)}
        name="notification_configuration.rocketchat_icon_url"
        type="text"
        validate={url()}
      />
      <CheckboxField
        id="rocketchat-ssl"
        label={i18n._(msg`Disable SSL verification`)}
        name="notification_configuration.rocketchat_no_verify_ssl"
      />
    </>
  );
}

function SlackFields() {
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  return (
    <>
      <ArrayTextField
        id="slack-channels"
        label={i18n._(msg`Destination channels`)}
        name="notification_configuration.channels"
        type="textarea"
        validate={required(null)}
        isRequired
        tooltip={helpText.slackChannels}
      />
      <PasswordField
        id="slack-token"
        label={i18n._(msg`Token`)}
        name="notification_configuration.token"
        validate={required(null)}
        isRequired
      />
      <FormField
        id="slack-color"
        label={i18n._(msg`Notification color`)}
        name="notification_configuration.hex_color"
        type="text"
        tooltip={helpText.slackColor}
      />
    </>
  );
}

function TwilioFields() {
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  return (
    <>
      <PasswordField
        id="twilio-token"
        label={i18n._(msg`Account token`)}
        name="notification_configuration.account_token"
        validate={required(null)}
        isRequired
      />
      <FormField
        id="twilio-from-phone"
        label={i18n._(msg`Source phone number`)}
        name="notification_configuration.from_number"
        type="text"
        validate={combine([required(null), twilioPhoneNumber()])}
        isRequired
        tooltip={helpText.twilioSourcePhoneNumber}
      />
      <ArrayTextField
        id="twilio-destination-numbers"
        label={i18n._(msg`Destination SMS number(s)`)}
        name="notification_configuration.to_numbers"
        type="textarea"
        validate={combine([required(null), twilioPhoneNumber()])}
        isRequired
        tooltip={helpText.twilioDestinationNumbers}
      />
      <FormField
        id="twilio-account-sid"
        label={i18n._(msg`Account SID`)}
        name="notification_configuration.account_sid"
        type="text"
        validate={required(null)}
        isRequired
      />
    </>
  );
}

function WebhookFields() {
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  const [methodField, methodMeta] = useField({
    name: 'notification_configuration.http_method',
    validate: required(i18n._(msg`Select a value for this field`)),
  });
  return (
    <>
      <FormField
        id="webhook-username"
        label={i18n._(msg`Username`)}
        name="notification_configuration.username"
        type="text"
      />
      <PasswordField
        id="webhook-password"
        label={i18n._(msg`Basic auth password`)}
        name="notification_configuration.password"
      />
      <FormField
        id="webhook-url"
        label={i18n._(msg`Target URL`)}
        name="notification_configuration.url"
        type="text"
        validate={combine([required(null), url()])}
        isRequired
      />
      <CheckboxField
        id="webhook-ssl"
        label={i18n._(msg`Disable SSL verification`)}
        name="notification_configuration.disable_ssl_verification"
      />
      <FormFullWidthLayout>
        <CodeEditorField
          id="webhook-headers"
          name="notification_configuration.headers"
          label={i18n._(msg`HTTP Headers`)}
          mode="javascript"
          tooltip={helpText.webhookHeaders}
          rows={5}
        />
      </FormFullWidthLayout>
      <FormGroup
        fieldId="webhook-http-method"
        helperTextInvalid={methodMeta.error}
        isRequired
        validated={
          !methodMeta.touched || !methodMeta.error ? 'default' : 'error'
        }
        label={i18n._(msg`HTTP Method`)}
      >
        <AnsibleSelect
          {...methodField}
          id="webhook-http-method"
          data={[
            {
              value: '',
              key: '',
              label: i18n._(msg`Choose an HTTP method`),
              isDisabled: true,
            },
            { value: 'POST', key: 'post', label: i18n._(msg`POST`) },
            { value: 'PUT', key: 'put', label: i18n._(msg`PUT`) },
          ]}
        />
      </FormGroup>
    </>
  );
}
