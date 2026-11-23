# Notification System Overview

A notification template is a named configuration of one notification type
(Email, Slack, Webhook, and so on): where to send, with which credentials,
and optionally custom messages. Templates are attached to the objects whose
jobs should report: job templates, workflow job templates, projects,
inventory sources, system job templates and organizations, each for the
events it should report (job started, succeeded, failed, reported changes,
or a workflow approval changing state). When such an event happens, every
attached template renders its message and sends it, and the attempt is
recorded as a notification.

The API is `src/internal/api/notification_templates.go`; the types, their
parameters and default messages are `src/internal/api/notification_types.go`,
the senders `src/internal/api/notify_backends.go`, and the rendering and
sending of job and approval notifications
`src/internal/api/notifications_send.go`.


## Notification templates

```
POST /api/v2/notification_templates/

{
    "name": "Ops e-mail",
    "description": "Failures go to the ops list",
    "organization": 1,
    "notification_type": "email",
    "notification_configuration": {
        "host": "smtp.example.com",
        "port": 587,
        "username": "ascender",
        "password": "...",
        "use_tls": true,
        "use_ssl": false,
        "sender": "ascender@example.com",
        "recipients": ["ops@example.com"],
        "timeout": 30
    },
    "messages": null
}
```

- `notification_type` is one of `email`, `grafana`, `irc`, `matrix`,
  `mattermost`, `pagerduty`, `rocketchat`, `slack`, `twilio`, `webhook`.
- `notification_configuration` takes the type's parameters, listed under
  [Notification types](#notification-types). Every parameter without a
  default is required ("Missing required fields for Notification
  Configuration: ['host', 'port']."), each must have its exact JSON type
  ("Configuration field 'port' incorrect type, expected int."), and a list
  may not be empty ("No values specified for field 'recipients'"). These
  errors are reported together under `__all__`. Parameters with a default
  (an email's `timeout`, a webhook's `http_method`) are filled in when left
  out.
- Besides its parameters, a type keeps the *optional* settings its sender
  reads (Slack's `hex_color`, Grafana's dashboard, panel, tags, region and
  verification settings, Mattermost's and Rocket.Chat's channel, username
  and icon). They are neither required nor type-checked. Any other key in
  `notification_configuration` is dropped when the template is saved. The
  old application kept every key; dropping the rest means a key stored
  beside a type's secret cannot be read by the type the template is
  changed to next, and keys that no sender of the type reads (Django's
  SMTP `ssl_keyfile` and `ssl_certfile`, which name files on the server,
  or `fail_silently`) are not taken.
- `password` parameters are stored encrypted and read back as
  `$encrypted$`. Sending `$encrypted$` back on an update keeps the stored
  value. A user other than a superuser who keeps a stored secret this way
  may not, in the same update, change where it goes (the type, or a host,
  port, URL or TLS setting of the destination, Grafana's
  `grafana_no_verify_ssl` included); the update fails with
  "Re-enter password: it cannot be kept when host changes." and the
  secret has to be entered again.
- Changing `notification_type` needs a new `notification_configuration` in
  the same request: "This field is required when notification_type
  changes." The new configuration replaces the old one entirely, so the old
  type's optional settings do not carry over; only the new type's are
  kept.
- Names are unique within an organization.

Copying a template (`POST /api/v2/notification_templates/<id>/copy/` with a
`name`) copies its configuration, secrets included, and its messages.

A template cannot be deleted while it has a notification that is still
`pending` and less than 8 hours old: `405` with
`{"error": "Delete not allowed while there are pending notifications"}`.
Deleting a template deletes its notifications.

### Who can manage templates

Superusers and system auditors see every template; other users see the
templates of the organizations they are a notification admin or an auditor
of. Superusers and an organization's notification admins can create, change,
copy, test and delete its templates; a user other than a superuser must give
an `organization`. A template with no organization is a superuser's only. A
user who can see a template but not delete it (an organization auditor)
gets an empty `404` for a `DELETE`, as the old API answered.

Attaching a template to an object needs the notification admin role on the
template's organization and the admin role on the object (only superusers
attach to system job templates).


## Attaching templates to events

Each object has a list per event it reports, and `POST {"id": <template>}`
to the list attaches a template (`{"id": <template>, "disassociate": true}`
detaches it):

| Object | Lists |
|:-------|:------|
| `/api/v2/organizations/<id>/` | `notification_templates_started`, `_success`, `_error`, `_changed`, `_approvals` |
| `/api/v2/job_templates/<id>/` | `notification_templates_started`, `_success`, `_error`, `_changed` |
| `/api/v2/workflow_job_templates/<id>/` | `notification_templates_started`, `_success`, `_error`, `_approvals` |
| `/api/v2/projects/<id>/` | `notification_templates_started`, `_success`, `_error` |
| `/api/v2/inventory_sources/<id>/` | `notification_templates_started`, `_success`, `_error` |
| `/api/v2/system_job_templates/<id>/` | `notification_templates_started`, `_success`, `_error` |

`/api/v2/organizations/<id>/notification_templates/` lists, and creates, the
organization's own templates.


## When notifications are sent

| Event | Sent when |
|:------|:----------|
| `started` | the job starts running |
| `success` | the job finishes `successful` |
| `error` | the job finishes `failed`, `error` or `canceled`, or fails before it starts |
| `changed` | a playbook job or an ad hoc command finishes (successful or not) and reported a change on at least one host, check mode included |
| workflow approval `running`, `approved`, `denied`, `timed_out` | an approval node starts waiting, is approved, is denied, or times out |

A `changed` notification is sent in addition to the `success` or `error`
one, not instead of it, which is what makes it useful for a check-mode
playbook that only reports drift.

Which templates a job uses:

- A job uses the templates attached to its job template, to the job
  template's project, and to the job template's organization. For
  `changed`, only the job template's and its organization's.
- A project update uses the project's templates and its organization's.
- An inventory update uses the inventory source's templates and those of
  the inventory's organization.
- A workflow job uses its workflow job template's templates and its
  organization's; approvals use the workflow job template's
  `notification_templates_approvals` and the organization's.
- An ad hoc command uses the templates of the organizations owning the
  inventories of the hosts it ran on, `changed` included (a change is a
  host event of the command that reported one).
- A system job uses its system job template's `started`, `success` and
  `error` templates, never an organization's, and has no `changed`
  notifications.

A template attached in several of these places sends once.

Each send creates a notification and links it to the job, so a job's
notifications are at `/api/v2/<jobs, project_updates, inventory_updates,
workflow_jobs, ad_hoc_commands, system_jobs>/<id>/notifications/`, and all
of them at `/api/v2/notifications/`. A failed notification never changes
the job's status.

Sending happens in the background of the process that saw the event: the
task process for job status changes and approval timeouts, the web process
for approvals and denials made through the API and for tests. There is no
queue and no retry: a notification left `pending` (the process stopped
before it finished sending) stays so.


## Notifications

```
GET /api/v2/notifications/<id>/

{
    "id": 12,
    "type": "notification",
    ...
    "notification_template": 3,
    "error": "",
    "status": "successful",
    "notifications_sent": 1,
    "notification_type": "email",
    "recipients": "['ops@example.com']",
    "subject": "Job #42 'Deploy' failed: https://ascender.example.com/#/jobs/playbook/42",
    "body": "Job #42 had status failed, view details at ..."
}
```

`status` is `pending` until the send finishes, then `successful` or
`failed`; a failure's reason is in `error`. `notifications_sent` is how many
messages went out (for example one per Slack channel or SMS number).
`subject` is left out for webhooks, and `body` is shown only for the email,
webhook, PagerDuty and Matrix types.


## Testing a template

```
POST /api/v2/notification_templates/<id>/test/
```

sends a test message with the template's configuration and answers `202`
with the new notification (and its id again as `notification`), with
`Location` set to it. The message is "Notification Test <id>
<ASCENDER_URL_BASE>" and the body "Test Notification <id>
<ASCENDER_URL_BASE>" (as `{"body": "..."}` for webhooks and Grafana). The
send runs after the answer, so the outcome is read from the notification
afterwards. Only superusers and notification admins of the template's
organization can test it (`403` otherwise).


## Message templates

Each type has default messages for each event. A template's `messages`
replaces any of them:

```
PATCH /api/v2/notification_templates/<id>/

{
    "messages": {
        "started": {
            "message": "{{ job.name }} started on instance group {{ job.summary_fields.instance_group.name }}",
            "body": null
        },
        "success": null,
        "error": {
            "message": "{{ job.name }} was unsuccessful ({{ job.status }})",
            "body": "{{ job.job_explanation }}"
        },
        "changed": {
            "message": "{{ job.name }} reported changes on {{ job.hosts | length }} hosts",
            "body": null
        },
        "workflow_approval": {
            "running": {
                "message": "{{ approval_node_name }} needs review: {{ workflow_url }}",
                "body": null
            }
        }
    }
}
```

The events are `started`, `success`, `error`, `changed` and
`workflow_approval`, the last with `running`, `approved`, `timed_out` and
`denied`. Each has a `message`, a single line used as the subject (an
email's subject, a Slack or IRC message, an SMS), and a `body`, used by the
types that send one (email, webhook, PagerDuty, Grafana, Matrix). A `null`
or empty one uses the type's default. An update that leaves an event out
keeps its stored messages for `started`, `success`, `error` and
`workflow_approval`.

The default message is
`{{ job_friendly_name }} #{{ job.id }} '{{ job.name }}' {{ job.status }}: {{ url }}`
(for `changed`, `... reported changes: {{ url }}`). The default email body
adds `{{ job_metadata }}`; the webhook, PagerDuty and Grafana bodies are
`{{ job_metadata }}` alone; Matrix's is HTML.

### What a template can use

Messages are Jinja templates, rendered by the Jinja port in
`src/internal/jinja` in an immutable sandbox (no attribute assignment, no
unsafe calls). For a job's events they see:

- `job`: the job's fields from its API serialization, limited to an allowed
  list: `id`, `type`, `url`, `created`, `modified`, `name`, `description`,
  `job_type`, `playbook`, `forks`, `limit`, `verbosity`, `job_tags`,
  `force_handlers`, `skip_tags`, `start_at_task`, `timeout`,
  `use_fact_cache`, `launch_type`, `status`, `failed`, `started`,
  `finished`, `elapsed`, `job_explanation`, `execution_node`,
  `controller_node`, `allow_simultaneous`, `scm_revision`, `diff_mode`,
  `job_slice_number`, `job_slice_count`, `scm_branch`, `artifacts`,
  `host_status_counts`, and `summary_fields` with `inventory`, `project`,
  `job_template`, `unified_job_template`, `instance_group`, `created_by`,
  `schedule` and `labels` (each with a few of its fields). For playbook
  jobs `job.hosts` lists the names of the hosts it ran on (the first 1,000,
  sorted).
- `job_friendly_name`: "Job", "Project Update", "Inventory Update",
  "Workflow Job", "AdHoc Command" or "System Job".
- `url`: the job's page in the UI, built from `ASCENDER_URL_BASE`.
- `job_metadata`: a JSON text (indented by four spaces) with the job's
  `id`, `name`, `url`, `created_by`, `started`, `finished`, `status` and
  `traceback`, plus for a playbook job its `inventory`, `project`,
  `playbook`, `credential`, `limit`, `extra_vars` (survey passwords hidden)
  and `hosts` (each host's summary counts), and for a workflow job a
  `body` summarising its nodes, `inventory`, `limit` and `extra_vars`. The
  other kinds (project, inventory and system jobs, ad hoc commands) have
  the common fields only.

Approval events see `approval_status`, `approval_node_name`,
`workflow_url`, `context_message` (when the approval has one) and
`job_metadata`. The sample job that [validation](#validation) renders
against has no `context_message`, so a custom message that uses it is
refused ("Field 'context_message' unavailable"); only the default approval
bodies show it.

Anything not in the context renders as nothing for job events (Jinja's
`ChainableUndefined`). If a template fails to render, the job's
notification carries the error and a traceback instead of the message; an
approval's message renders empty. A job notification whose body renders to
nothing gets the body "The template rendering return a blank body. Please
check the template. Refer to https://github.com/ansible/awx/issues/13983
for further information." (on four lines).

Rendering runs in a child process with a 20-second CPU limit, a 15-second
render deadline, about 256 MB of memory and a 16 MiB cap on its output
(`src/internal/jinjarun/run.go`).

### Validation

A create or update renders the custom messages against a sample job and
refuses the template with `400` and a list under `messages`:

- "Event 'finished' invalid, must be one of 'started', 'success', 'error',
  'changed', or 'workflow_approval'"
- "Workflow Approval event 'pending' invalid, must be one of 'running',
  'approved', 'timed_out', or 'denied'"
- "Message type 'subject' invalid, must be either 'message' or 'body'"
- "Messages cannot contain newlines (found newline in error event)"
- "Unable to render message '{{ job.name }': ..." for a syntax error
- "Field 'nonexistent' unavailable" for a field not in the context
- "Security error due to field '...'" for what the sandbox forbids
- for webhooks, "Webhook body for 'error' is not valid. The following gave
  an error (...)."


## Notification types

Each type below lists its `notification_configuration` parameters. Those
marked *optional* are not among the type's parameters: they may be left
out, and are kept when given.

The HTTP-based types give connecting, and each read and write,
`ASCENDER_NOTIFICATION_REQUEST_TIMEOUT` seconds (30 unless the settings file
sets it; see [Settings](./settings.md)): a timeout per socket operation
rather than for the whole request. They send `User-Agent: Ascender <version> (open)`
where the service takes it, and follow no redirects (except webhooks,
below). A failed HTTP answer is reported in the notification's `error`.

### Email

SMTP, one message to all recipients, plain text in UTF-8, with the rendered
message as the subject and the body as the text.

- `host`, `port` (int)
- `username`, `password`: used to log in only when both are set, with
  CRAM-MD5, PLAIN or LOGIN, whichever the server offers first in that order.
  "SMTP AUTH extension not supported by server." or "No suitable
  authentication method found." otherwise.
- `use_ssl` (bool): connect with TLS (usually port 465).
- `use_tls` (bool): upgrade with STARTTLS (usually port 587). Setting both
  fails: "EMAIL_USE_TLS/EMAIL_USE_SSL are mutually exclusive, so only set
  one of those settings to True."
- `sender`, `recipients` (list)
- `timeout` (int, default 30): seconds that connecting, and each read and
  write, may take (smtplib's socket timeout). Values above 300 are taken as
  300, so that one server that never answers cannot hold the send for
  longer. `0` fails the send with "Non-blocking socket (timeout=0) is not
  supported", a negative value with "Timeout value out of range".

The server's certificate is verified.

### Slack

Posts with `chat.postMessage` to `https://slack.com/api/chat.postMessage`,
one message per channel, as the bot user.

- `token`: the bot token.
- `channels` (list): channel names or IDs; a leading `#` is dropped.
  `<channel>,<thread timestamp>` replies in that thread.
- `hex_color` (*optional*): `#rgb` or `#rrggbb`, sends the message as a
  coloured attachment.

Slack gets the message only. A refusal reads "The request to the Slack API
failed. (url: https://slack.com/api/chat.postMessage) The server responded
with: {...}".

### Mattermost

Posts to an incoming webhook, which has to be enabled in Mattermost's System
Console (as does letting integrations override the username and icon, for
those options).

- `mattermost_url`: the webhook URL, which is itself the secret.
- `mattermost_no_verify_ssl` (bool): despite its label, "Verify SSL", true
  turns certificate verification off.
- `mattermost_channel`, `mattermost_username`, `mattermost_icon_url`
  (*optional*): override the webhook's channel, the displayed name and the
  icon. A channel that does not exist fails the notification.

Mattermost gets the message only. Any answer outside 2xx fails with "Error
sending notification mattermost: <status>".

### Rocket.Chat

Posts to an incoming webhook integration created under Administration >
Integrations.

- `rocketchat_url`: the webhook URL.
- `rocketchat_no_verify_ssl` (bool): true turns certificate verification
  off.
- `rocketchat_username`, `rocketchat_icon_url` (*optional*).

Rocket.Chat gets the message only. "Error sending notification rocket.chat:
<status>" on failure.

### PagerDuty

Triggers an event with the Events API v1
(`https://events.pagerduty.com/generic/2010-04-15/create_event.json`):
`service_key`, `event_type: "trigger"`, the message as `description`, the
body as `details` (the JSON object when the body holds one, else the
text), and `client`.

- `service_key`: the service's integration key.
- `client_name`: sent as `client`, to tell integrations apart.
- `subdomain`, `token`: required but not used by the send.

### Twilio

Sends the message as an SMS to each number through
`https://api.twilio.com/2010-04-01/Accounts/<sid>/Messages.json`, with the
account SID and token as Basic credentials.

- `account_sid`, `account_token`
- `from_number`: a number of the account's messaging service, as
  `+15556667777`.
- `to_numbers` (list)

A failure for one number does not stop the others; the notification fails
with the first error (for example "400 Client Error: Bad Request for url:
...") and `notifications_sent` counts the ones that went out.

### IRC

Connects, registers as `nickname`, joins each channel, sends each line of
the message, and quits.

- `server`, `port` (int), `nickname`
- `password`: the server password, sent with `PASS` when not empty.
  NickServ identification is not supported.
- `use_ssl` (bool): connect with TLS; the certificate is verified.
- `targets` (list): channels (starting with `#`, `&`, `+` or `!`) and
  nicknames.

The server has 60 seconds to accept the registration ("timed out waiting for
the irc server to accept the connection"); a `4xx` reply fails the
notification with the server's line. A channel that cannot be joined is
skipped without failing it. A target listed more than once gets the
message once. The message is split into lines as Python's
`str.splitlines()` split it (on `\n`, `\r`, `\r\n`, `\v`, `\f`, `\x1c` to
`\x1e`, `\x85`, U+2028 and U+2029, with no empty line after a final break;
an empty message is one empty line). Each line sent is cut to 510 bytes,
and any carriage return, line feed or NUL byte left in it (from a target or
the nickname) is removed. `notifications_sent` counts the targets that got
the message.

### Matrix

Posts an `m.room.message` event to the homeserver's client-server API
(`PUT /_matrix/client/v3/rooms/{roomId}/send/m.room.message/{txnId}`), so it
works with any homeserver that follows the specification. It sends as an
ordinary Matrix user, identified by an access token; that user has to be in
every destination room already.

- `homeserver_url`: the base URL of the client API, for example
  `https://matrix.example.org` ("Homeserver URL must start with 'http://' or
  'https://'."). The `/_matrix/client/v3` paths are added.
- `access_token`: the sending user's token.
- `rooms` (list): room IDs (`!abcdef:example.org`) or aliases
  (`#automation:example.org`); aliases are resolved through the room
  directory first.
- `use_html` (bool, default true): the message is always sent as the
  plain-text `body`; with this on, the rendered body goes alongside it as an
  HTML `formatted_body` (`org.matrix.custom.html`). The default bodies make
  the job link a clickable anchor.
- `disable_ssl_verification` (bool, default false)

A homeserver that rate limits the sender (`429`) is tried up to three times,
waiting its `retry_after_ms` (at most 10 seconds). Other errors are
reported with the homeserver's `errcode` and `error`, for example "Error
sending notification to room !abc:example.org via Matrix: 403 (M_FORBIDDEN
...)" or `M_UNKNOWN_TOKEN` for a bad token.

### Webhook

Sends the body as JSON to a URL.

- `url`
- `http_method` (default `POST`): `POST` or `PUT` ("HTTP method must be
  either 'POST' or 'PUT'.").
- `disable_ssl_verification` (bool, default false; labelled "Verify SSL")
- `username`, `password` (default empty): Basic credentials, sent when
  either is set.
- `headers` (object): extra headers, added to `Content-Type:
  application/json` and the `User-Agent`.

The rendered body must be a JSON object; anything else is sent as `{}`. The
default body is `{{ job_metadata }}`, so the receiver gets the job's
metadata as an object.

A `301` or `307` answer is followed, up to five requests in all, to its
`Location` as given (a relative one fails as requests failed it: "Invalid
URL '/next': No scheme supplied. Perhaps you meant https:///next?"). When
the redirect leads to another scheme, host or port, the credentials and
custom headers are dropped. The errors name URLs base64-encoded, as the old
backend logged them:

- an answer of `400` or more: "Error sending webhook notification:
  <status>";
- too many redirects: "Webhook notification max number of retries [5]
  exceeded. Failed to send webhook notification to <last URL>";
- a redirect without a `Location`: "Webhook notification received redirect
  to a blank URL from <URL>. Response headers={...}" (the headers sorted by
  name, where the old message kept the server's order);
- a `Location` that cannot be parsed (an unclosed IPv6 bracket, a port that
  is not a number up to 65535), which is not followed: "Webhook
  notification received redirect to an invalid URL <Location> from <URL>".

Other `3xx` answers end the send without an error but count no message
sent.

### Grafana

Creates an annotation through `<grafana_url>/api/annotations`, with the API
key as a Bearer token. The annotation spans the job, from its start to its
end (taken from the body, `{{ job_metadata }}` by default), and its text is
the message.

- `grafana_url`: the base URL; `/api/annotations` is added.
- `grafana_key`: a Grafana API key.
- `dashboardId`, `panelId` (*optional*): numbers as text, empty for none.
  Without either, the annotation is global. A template without them fails
  every send with "int() argument must be a string, a bytes-like object or
  a real number, not 'NoneType'", as the old sender did; the UI always
  sends both.
- `annotation_tags` (*optional*, list)
- `isRegion` (*optional*, default true)
- `grafana_no_verify_ssl` (*optional*, bool)

Any answer outside 2xx fails with "Error sending notification grafana:
<status>".


## Network guard

A notification administrator chooses where notifications connect, so the
senders never connect to the cloud metadata services, which hand out the
host's own credentials (`src/internal/netguard/netguard.go`). They refuse
link-local addresses (169.254.0.0/16, which includes 169.254.169.254, and
fe80::/10) and the metadata addresses fd00:ec2::254, 100.100.100.200,
192.0.0.192 and 168.63.129.16. The check is made on the address actually
dialled, after name resolution, so a name that resolves to one of them is
refused too; the notification fails with an error such as "refusing to
connect to link-local address 169.254.169.254". Loopback and private
addresses stay allowed, so a local mail relay or an internal webhook works.

When the process has `HTTPS_PROXY` or `HTTP_PROXY` set (and the target is
not in `NO_PROXY`), the HTTP-based types connect through the proxy. The dial
check then sees only the proxy's address, so the target's host is checked
before the request goes to the proxy: an address, or a name resolving here
to one, of the kinds above is refused with the same error. A name this host
cannot resolve is left to the proxy.

For a service whose certificate is signed by a private CA, add the CA to the
container's trust store as described in
[deploy/README.md](../deploy/README.md), or turn verification off in the
template where the type allows it.
