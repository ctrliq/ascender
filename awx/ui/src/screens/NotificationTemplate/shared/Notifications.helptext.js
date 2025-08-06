import React from 'react';
import { t } from '@lingui/react/macro';

// Accept i18n as an argument instead of using useLingui
const helpText = (i18n) => ({
  emailRecepients: i18n._(
    t`Use one email address per line to create a recipient list for this type of notification.`
  ),
  emailTimeout: i18n._(
    t`The amount of time (in seconds) before the email
        notification stops trying to reach the host and times out. Ranges
        from 1 to 120 seconds.`
  ),
  grafanaUrl: i18n._(
    t`The base URL of the Grafana server - the
      /api/annotations endpoint will be added automatically to the base
      Grafana URL.`
  ),
  grafanaTags: i18n._(t`Use one Annotation Tag per line, without commas.`),
  ircTargets: i18n._(
    t`Use one IRC channel or username per line. The pound
        symbol (#) for channels, and the at (@) symbol for users, are not
        required.`
  ),
  slackChannels: (
    <>
      {i18n._(
        t`One Slack channel per line. The pound symbol (#)
        is required for channels. To respond to or start a thread to a specific message add the parent message Id to the channel where the parent message Id is 16 digits. A dot (.) must be manually inserted after the 10th digit.  ie:#destination-channel, 1231257890.006423. See Slack`
      )}{' '}
      <a href="https://api.slack.com/messaging/retrieving#individual_messages">
        {i18n._(t`documentation`)}
      </a>{' '}
      <span>{i18n._(t`for more information.`)}</span>
    </>
  ),
  slackColor: i18n._(
    t`Specify a notification color. Acceptable colors are hex
        color code (example: #3af or #789abc).`
  ),
  twilioSourcePhoneNumber: i18n._(
    t`The number associated with the "Messaging
        Service" in Twilio with the format +18005550199.`
  ),
  twilioDestinationNumbers: i18n._(
    t`Use one phone number per line to specify where to
        route SMS messages. Phone numbers should be formatted +11231231234. For more information see Twilio documentation`
  ),
  webhookHeaders: i18n._(
    t`Specify HTTP Headers in JSON format. Refer to
      the Ansible Controller documentation for example syntax.`
  ),
  emailOptions: (
    <>
      {i18n._(t`See Django`)}{' '}
      <a
        href="https://docs.djangoproject.com/en/4.0/ref/settings/#std:setting-EMAIL_USE_TLS"
        target="_blank"
        rel="noopener noreferrer"
      >
        {i18n._(t`documentation`)}
      </a>{' '}
      <span>{i18n._(t`for more information.`)}</span>
    </>
  ),
});

export default helpText;
