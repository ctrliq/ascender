---
title: Notifications
description: Create notification templates for email, Slack, webhooks, and other services, customize their messages, and attach them to Ascender jobs and resources.
weight: 71
---

A [notification template](../glossary#notification-template) is an instance of a [notification](../glossary#notification) type (Email, Slack, Webhook, etc.) with a name, description, and a defined configuration.

For example:

- A username, password, server, and recipients are needed for an Email notification template
- The token and a list of channels are needed for a Slack notification template
- The URL and Headers are needed for a Webhook notification template

A Notification is a manifestation of the notification template; for example, when a job fails, a notification is sent using the configuration defined by the notification template.

At a high level, the typical flow for the notification system works as follows:

- A user creates a notification template to the REST API at the `/api/v2/notification_templates` endpoint (either through the API or through the UI).
- A user assigns the notification template to any of the various objects that support it (all variants of job templates as well as organizations and projects) and at the appropriate trigger level for which they want the notification (started, success, error, or, for job templates and organizations, changed). For example a user may wish to assign a particular notification template to trigger when Job Template 1 fails. In which case, they will associate the notification template with the job template at `/api/v2/job_templates/n/notification_templates_error` API endpoint.
- You can set notifications on job start, not just job end. Every notification template belongs to an organization: system administrators and the organization's notification admins create them, and attach them to the resources they can administer.

## Notification Hierarchy

Notification templates assigned at certain levels will inherit templates defined on parent objects as such:

- Job Templates will use notification templates defined on it as well as inheriting notification templates from the Project used by the Job Template and from the job template's Organization.
- Project Updates will use notification templates defined on the project and will inherit notification templates from the Organization associated with it
- Inventory Updates will use notification templates defined on the inventory source and will inherit notification templates from the Organization of its inventory
- Ad-hoc commands will use notification templates defined on the Organization that the inventory is associated with

## Workflow

When a job succeeds or fails, the error or success handler will pull a list of relevant notification templates using the procedure defined above. It will then create a Notification object for each one containing relevant details about the job and then sends it to the destination (email addresses, slack channel(s), sms numbers, etc). These Notification objects are available as related resources on job types (jobs, inventory updates, project updates), and also at `/api/v2/notifications`. You may also see what notifications have been sent from a notification template by examining its related resources.

If a notification fails, it will not impact the job associated to it or cause it to fail. The status of the notification can be viewed at its detail endpoint (`/api/v2/notifications/<n>`).

## Create a Notification Template

To create a Notification Template:

1. Click **Notifications** from the left navigation bar.
2. Click the **Add** button.

   ![Create New Notification Template form](/assets/images/notifications-template-add-new.webp)

3. Enter the name of the notification and a description in their respective fields, and specify the organization (required) it belongs to.
4. Choose a type of notification from the **Type** drop-down menu. Refer to the subsequent sections for additional information.
5. Once all required information is complete, click **Save** to add the notification.

## Notification Types

Notification types supported with Ascender:

- [Email](#email)
- [Grafana](#grafana)
- [IRC](#irc)
- [Matrix](#matrix)
- [Mattermost](#mattermost)
- [PagerDuty](#pagerduty)
- [Rocket.Chat](#rocketchat)
- [Slack](#slack)
- [Twilio](#twilio)
- [Webhook](#webhook)

Each of these have their own configuration and behavioral semantics and testing them may need to be approached in different ways. Additionally, you can customize each type of notification down to a specific detail, or a set of criteria to trigger a notification. See [Create custom notifications](#create-custom-notifications) for more detail on configuring custom notifications. The following sections will give as much detail as possible on each type of notification.

### Email

The email notification type supports a wide variety of SMTP servers and has support for TLS/SSL connections.

You must provide the following details to set up an email notification:

- Host
- Recipient list
- Sender email
- Port
- Timeout (in seconds): allows you to specify up to 120 seconds, the length of time Ascender may attempt connecting to the email server before giving up.

![Email notification template form](/assets/images/notification-template-email.webp)

### Grafana

Grafana is a fairly straightforward integration. First, create an API Key in the [Grafana system](http://docs.grafana.org/tutorials/api_org_token_howto/) (this is the token that is given to Ascender).

You must provide the following details to set up a Grafana notification:

- Grafana URL: The URL of the Grafana API service, generally `http://yourcompany.grafana.com`.
- Grafana API Key: The user must first create an API Key in the Grafana system (this is the token that is given to Ascender).

The other options of note are:

- ID of the Dashboard: When you created an API Key for the Grafana account, you can set up a dashboard with its own unique ID.
- ID of the Panel: If you added panels and graphs to your Grafana interface, you can specify its ID here.
- Tags for the Annotation: Enter keywords that help identify the type(s) of events(s) of the notification you are configuring.
- Disable SSL Verification: SSL verification is on by default, but you can choose to turn off verification the authenticity of the target's certificate. Environments that use internal or private CAs should select this option to disable verification.

![Grafana notification template form](/assets/images/notification-template-grafana.webp)

### IRC

The IRC notification takes the form of an IRC bot that will connect, deliver its messages to channel(s) or individual user(s), and then disconnect. The notification bot also supports SSL authentication. The bot does not currently support Nickserv identification. If a channel or user does not exist or is not on-line then the Notification will not fail; the failure scenario is reserved specifically for connectivity.

Connectivity information is straightforward:

- IRC Server Password (optional): IRC servers can require a password to connect. If the server does not require one, leave blank
- IRC Server Port: The IRC server Port
- IRC Server Address: The host name or address of the IRC server
- IRC Nick: The bot's nickname once it connects to the server
- Destination Channels or Users: A list of users and/or channels to which to send the notification.
- SSL Connection (optional): Should the bot use SSL when connecting

![IRC notification template form](/assets/images/notification-template-irc.webp)

### Matrix

The Matrix notification type sends messages into [Matrix](https://matrix.org) rooms on any homeserver (for example Synapse, Conduit or Dendrite). Messages are sent as an ordinary Matrix user, so first create or pick the account the notifications should come from, obtain an access token for it, and invite it to every room that should receive notifications. The parameters that can be specified are:

- Homeserver URL (required): The base URL of the homeserver's client API, for example `https://matrix.example.org`. The `/_matrix/client/v3` paths are added automatically.
- Access Token (required): The access token of the sending user. It is stored encrypted.
- Destination Rooms (required): One room per line, as a room ID (`!abcdef:example.org`) or a room alias (`#automation:example.org`).
- Send HTML Formatted Body: Selected by default. The notification message is always sent as plain text. With this option on, the notification body is also sent as HTML (`org.matrix.custom.html`), so the link back to the job is clickable in clients that render HTML; other clients show the plain text.
- Disable SSL Verification: Turns off verification of the authenticity of the homeserver's certificate. Environments that use internal or private CAs should select this option to disable verification.

When you [customize the messages](#create-custom-notifications) for a Matrix notification, the *message* is the plain-text version and the *body* is the HTML version of the same notification.

### Mattermost

The Mattermost notification type provides a simple interface to Mattermost's messaging and collaboration workspace. The parameters that can be specified are:

- Target URL (required): The full URL that will be POSTed to
- Username
- Channel
- Icon URL: specifies the icon to display for this notification
- Disable SSL Verification: Turns off verification of the authenticity of the target's certificate. Environments that use internal or private CAs should select this option to disable verification.

![Mattermost notification template form](/assets/images/notification-template-mattermost.webp)

### PagerDuty

PagerDuty is a fairly straightforward integration. First, create an API Key in the [PagerDuty system](https://support.pagerduty.com/docs/generating-api-keys) (this is the token that is given to Ascender) and then create a "Service" which provides an "Integration Key" that will also be given to Ascender. The other required options are:

- API Token: The user must first create an API Key in the PagerDuty system (this is the token that is given to Ascender).
- PagerDuty Subdomain: When you sign up for the PagerDuty account, you receive a unique subdomain to communicate with. For instance, if you signed up as "testuser", the web dashboard will be at `testuser.pagerduty.com` and you will give the API `testuser` as the subdomain (not the full domain).
- API Service/Integration Key
- Client Identifier: This will be sent along with the alert content to the PagerDuty service to help identify the service that is using the API key/service. This is helpful if multiple integrations are using the same API key and service.

![PagerDuty notification template form](/assets/images/notification-template-pagerduty.webp)

### Rocket.Chat

The Rocket.Chat notification type provides an interface to Rocket.Chat's collaboration and communication platform. The parameters that can be specified are:

- Target URL (required): The full URL that will be POSTed to
- Username
- Icon URL: specifies the icon to display for this notification
- Disable SSL Verification: Turns off verification of the authenticity of the target's certificate. Environments that use internal or private CAs should select this option to disable verification.

![Rocket.Chat notification template form](/assets/images/notification-template-rocketchat.webp)

### Slack

Slack, a collaborative team communication and messaging tool, is pretty easy to configure.

You must supply the following to set up Slack notifications:

- A Slack app (refer to the [Basic App Setup](https://api.slack.com/authentication/basics) page of the Slack documentation for information on how to create one)
- A token (refer to [Enabling Interactions with Bots](https://api.slack.com/bot-users) and specific details on bot tokens on the [Token Types](https://api.slack.com/authentication/token-types#bot) documentation page)

Once you have a bot/app set up, you must navigate to "Your Apps", click on the newly-created app and then go to **Add features and functionality**, which allows you to configure incoming webhooks, bots, and permissions; as well as **Install your app to your workspace**.

You must also invite the notification bot to join the channel(s) in question in Slack. Note that private messages are not supported.

![Slack notification template form](/assets/images/notification-template-slack.webp)

### Twilio

Twilio service is a Voice and SMS automation service. Once you are signed in, you must create a phone number from which the message will be sent. You can then define a "Messaging Service" under Programmable SMS and associate the number you created before with it.

Note that you may need to verify this number or some other information before you are allowed to use it to send to any numbers. The Messaging Service does not need a status callback URL nor does it need the ability to Process inbound messages.

Under your individual (or sub) account settings, you will have API credentials. Twilio uses two credentials to determine which account an API request is coming from. The "Account SID", which acts as a username, and the "Auth Token" which acts as a password.

To set up Twilio, provide the following details:

- Account Token
- Source Phone Number (this is the number associated with the messaging service above and must be given in the form of "+15556667777")
- Destination SMS number (this will be the list of numbers to receive the SMS and should be the 10-digit phone number)
- Account SID

![Twilio notification template form](/assets/images/notification-template-twilio.webp)

### Webhook

The webhook notification type provides a simple interface to sending POSTs to a predefined web service. Ascender will POST to this address using application/json content type with the data payload containing all relevant details in json format. Some web service APIs expect HTTP requests to be in a certain format with certain fields. You can configure more of the webhook notification in the following ways:

- configure the HTTP method (using **POST** or **PUT**)
- body of the outgoing request
- configure authentication (using basic auth)

The parameters for configuring webhooks are:

- Username
- Basic Auth Password
- Target URL (required): The full URL to which the webhook notification will be PUT or POSTed.
- Disable SSL Verification: SSL verification is on by default, but you can choose to turn off verification of the authenticity of the target's certificate. Environments that use internal or private CAs should select this option to disable verification.
- HTTP Headers (required): Headers in JSON form where the keys and values are strings. For example, `{"Authentication": "988881adc9fc3655077dc2d4d757d480b5ea0e11", "MessageType": "Test"}`
- HTTP Method (required). Select the method for your webhook:
  - POST: Creates a new resource. Also acts as a catch-all for operations that do not fit into the other categories. It is likely you need to POST unless you know your webhook service expects a PUT.
  - PUT: Updates a specific resource (by an identifier) or a collection of resources. PUT can also be used to create a specific resource if the resource identifier is known beforehand.

![Webhook notification template form](/assets/images/notification-template-webhook.webp)

#### Webhook payloads

Ascender sends by default the following data at the webhook endpoint:

```text
job id
name
url
created_by
started
finished
status
traceback
inventory
project
playbook
credential
limit
extra_vars
hosts
http method
```

An example of a `started` notification via webhook message as it is returned by Ascender:

```text
{"id": 38, "name": "Demo Job Template", "url": "https://host/#/jobs/playbook/38", "created_by": "bianca", "started":
"2020-07-28T19:57:07.888193+00:00", "finished": null, "status": "running", "traceback": "", "inventory": "Demo Inventory",
"project": "Demo Project", "playbook": "hello_world.yml", "credential": "Demo Credential", "limit": "", "extra_vars": "{}",
"hosts": {}}POST / HTTP/1.1
```

Ascender returns by default the following data at the webhook endpoint for a `success`/`fail` status:

```text
job id
name
url
created_by
started
finished
status
traceback
inventory
project
playbook
credential
limit
extra_vars
hosts
```

An example of a `success`/`fail` notification via webhook message as it is returned by Ascender:

```json
{"id": 46, "name": "Ascender-Collection-tests-awx_job_wait-long_running-XVFBGRSAvUUIrYKn", "url": "https://host/#/jobs/playbook/46",
"created_by": "bianca", "started": "2020-07-28T20:43:36.966686+00:00", "finished": "2020-07-28T20:43:44.936072+00:00", "status": "failed",
"traceback": "", "inventory": "Demo Inventory", "project": "Ascender-Collection-tests-awx_job_wait-long_running-JJSlglnwtsRJyQmw", "playbook":
"fail.yml", "credential": null, "limit": "", "extra_vars": "{\"sleep_interval\": 300}", "hosts": {"localhost": {"failed": true, "changed": 0,
"dark": 0, "failures": 1, "ok": 1, "processed": 1, "skipped": 0, "rescued": 0, "ignored": 0}}}
```

## Create custom notifications

You can [customize the text content](../notification-attributes) of each of the [notification types](#notification-types) by enabling the **Customize Messages** portion at the bottom of the notifications form using the toggle button.

![Notification template form with the Customize Messages toggle enabled](/assets/images/notification-template-customize.webp)

You can provide a custom message for various job events:

- Start
- Success
- Error
- Changed
- Workflow approved
- Workflow denied
- Workflow pending
- Workflow timed out

The message forms vary depending on the type of notification you are configuring. For example, messages for email notifications have the appearance of a typical email form with a subject and body, in which case, Ascender displays the fields as **Message** and **Message Body**. Email, PagerDuty and Matrix notifications have both fields, Webhook notifications have only a **Message Body**, and the other notification types only expect a **Message** for each type of event:

![Custom messages for a notification type that expects only a Message field per event](/assets/images/notification-template-customize-simple.webp)

The **Message** fields are pre-populated with a template containing a top-level variable, `job` coupled with an attribute, such as `id` or `name`, for example. Templates are enclosed in curly braces and may draw from a fixed set of fields provided by Ascender, as shown in the pre-populated **Messages** fields.

![Pre-populated Message fields showing the job variable template syntax](/assets/images/notification-template-customize-simple-syntax.webp)

This pre-populated field suggests commonly displayed messages to a recipient who is notified of an event. You can, however, customize these messages with different criteria by adding your own attribute(s) for the job as needed. Custom notification messages are rendered using Jinja - the same templating engine used by Ansible playbooks.

Messages and message bodies have different types of content:

- messages will always just be strings (one-liners only; new lines are not allowed)
- message bodies will be either a dictionary or block of text:
  - the message body for *Webhooks* and *PagerDuty* uses dictionary definitions. The default message body for these is `{{ job_metadata }}`, you can either leave that as is or provide your own dictionary
  - the message body for email uses a block of text or a multi-line string. The default message body is:

    ```jinja
    {{ job_friendly_name }} #{{ job.id }} had status {{ job.status }}, view details at {{ url }} {{ job_metadata }}
    ```

You can tweak this text (leaving `{{ job_metadata }}` in, or drop `{{ job_metadata }}` altogether). Since the body is a block of text, it can really be any string you want.

`{{ job_metadata }}` gets rendered as a dictionary containing fields that describe the job being executed. In all cases, `{{ job_metadata }}` will include the following fields:

- `id`
- `name`
- `url`
- `created_by`
- `started`
- `finished`
- `status`
- `traceback`

<Hint type="note">

At the present time, you cannot query individual fields within `{{ job_metadata }}`. When using `{{ job_metadata }}` in a notification template, all data will be returned.

</Hint>

The resulting dictionary will look something like this:

```json
{"id": 18,
 "name": "Project - Space Procedures",
 "url": "https://host/#/jobs/project/18",
 "created_by": "admin",
 "started": "2019-10-26T00:20:45.139356+00:00",
 "finished": "2019-10-26T00:20:55.769713+00:00",
 "status": "successful",
 "traceback": ""
}
```

If `{{ job_metadata }}` is rendered in a job, it will include the following additional fields:

- `inventory`
- `project`
- `playbook`
- `credential`
- `limit`
- `extra_vars`
- `hosts`

The resulting dictionary will look something like:

```json
{"id": 12,
 "name": "JobTemplate - Launch Rockets",
 "url": "https://host/#/jobs/playbook/12",
 "created_by": "admin",
 "started": "2019-10-26T00:02:07.943774+00:00",
 "finished": null,
 "status": "running",
 "traceback": "",
 "inventory": "Inventory - Fleet",
 "project": "Project - Space Procedures",
 "playbook": "launch.yml",
 "credential": "Credential - Mission Control",
 "limit": "",
 "extra_vars": "{}",
 "hosts": {}
}
```

If `{{ job_metadata }}` is rendered in a workflow job, it will include the following additional fields:

- `body` (this will enumerate all the nodes in the workflow job and includes a description of the job associated with each node)
- `inventory`
- `limit`
- `extra_vars`

The resulting dictionary will look something like this:

```text
{"id": 14,
 "name": "Workflow Job Template - Launch Mars Mission",
 "url": "https://host/#/jobs/workflow/14",
 "created_by": "admin",
 "started": "2019-10-26T00:11:04.554468+00:00",
 "finished": "2019-10-26T00:11:24.249899+00:00",
 "status": "successful",
 "traceback": "",
 "body": "Workflow job summary:\n\n- node #1 spawns job #15, \"Assemble Fleet JT\", which finished with status successful.\n- node #2 spawns job #16, \"Mission Start approval node\", which finished with status successful.\n- node #3 spawns job #17, \"Deploy Fleet\", which finished with status successful.",
 "inventory": "Inventory - Fleet",
 "limit": "",
 "extra_vars": "{}"
}
```

For more detail, refer to [Using variables with Jinja2](https://docs.ansible.com/ansible/latest/user_guide/playbooks_variables.html#using-variables-with-jinja2).

Ascender requires valid syntax in order to retrieve the correct data to display the messages. For a list of supported attributes and the proper syntax construction, refer to the [Supported Attributes for Custom Notifications](../notification-attributes) section of this guide.

If you create a notification template that uses invalid syntax or references unusable fields, an error message displays indicating the nature of the error. If you delete a notification's custom message, the default message is shown in its place.

<Hint type="note">

If you save the notifications template without editing the custom message (or edit and revert back to the default values), the **Details** screen assumes the defaults and will not display the custom message tables. If you edit and save any of the values, the entire table displays in the **Details** screen.

</Hint>

![Notification template Details screens with and without a custom message table](/assets/images/notifications-with-without-messages.webp)

## Enable and Disable Notifications

You can select which notifications to notify you when a specific job starts, in addition to notifying you on success or failure at the end of the job run. Some behaviors to keep in mind:

- if a workflow template (WFJT) has notification on start enabled, and a job template (JT) within that workflow also has notification on start enabled, you will receive notifications for both
- you can enable notifications to run on many JTs within a WFJT
- you can enable notifications to run on a sliced job template (SJT) start and each slice will generate a notification
- when you enable a notification to run on job start, and that notification gets deleted, the JT continues to run, but will result in an error message

You can enable notifications on job start, job success, and job failure, or any combination thereof, from the **Notifications** tab of the following resources:

- Job Template
- Workflow Template
- Projects (shown in the example below)
- Inventory Source
- Organizations

![Notifications tab of a project, listing notification templates with Start, Success, and Failure toggles](/assets/images/projects-notifications-example-list.webp)

For workflow templates that have approval nodes, in addition to *Start*, *Success*, and *Failure*, you can enable or disable certain approval-related events:

![Notifications tab of a workflow template with the additional approval toggle](/assets/images/wf-template-completed-notifications-view.webp)

Refer to [Approval nodes](../workflow-templates#approval-nodes) for additional detail on working with these types of nodes.

Job templates and organizations also offer a *Changed* trigger, which notifies when a run reported a change on any host. On an organization it covers the jobs and ad hoc commands run under it. It fires next to the trigger for how the run ended, so a job that changed something and succeeded notifies both *Success* and *Changed*. A run in check mode reports the changes it would have made, which makes this the trigger to use for a hardening or compliance playbook that runs nightly and should only be reported on when it finds drift. The API endpoint for the association is `/api/v2/job_templates/n/notification_templates_changed` and `/api/v2/organizations/n/notification_templates_changed`.

## Configure the `host` hostname for notifications

In the [System Settings](/admin-guide/configuration#system), you can replace the default value in the **Base URL of the service** field with your preferred hostname to change the notification hostname.

![Miscellaneous System settings with the Base URL of the service field](/assets/images/configure-ascender-system-misc-baseurl.webp)

The links in notifications are built from this setting, so set it to the address your users reach Ascender at. Until it is set, it holds the placeholder `https://ascenderhost`, and the links in notifications point there.

### Reset the `ASCENDER_URL_BASE`

The **Base URL of the service** field sets the `ASCENDER_URL_BASE` setting. Ascender does not take it from the requests it receives, with one exception: resetting the System settings to their defaults sets `ASCENDER_URL_BASE` to the address of the request that reset them.

A value given for `ASCENDER_URL_BASE` in a settings file takes precedence, and the setting is then read-only in the UI and the API. Otherwise the value saved through the settings is used, and otherwise the placeholder.

To change the `ASCENDER_URL_BASE` if it holds the wrong address, navigate to **Miscellaneous System settings** from the Settings menu and set it to the DNS entry you wish to appear in notifications.

## Notifications API

Use the `started`, `success`, or `error` endpoints:

```text
/api/v2/organizations/N/notification_templates_started/
/api/v2/organizations/N/notification_templates_success/
/api/v2/organizations/N/notification_templates_error/
```

Additionally, the `../../../N/notification_templates_started` endpoints have **GET** and **POST** actions for:

- Organizations
- Projects
- Inventory Sources
- Job Templates
- System Job Templates
- Workflow Job Templates
