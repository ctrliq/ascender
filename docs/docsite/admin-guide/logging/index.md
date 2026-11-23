---
title: Logging and Aggregation
description: Ascender log files, the structured loggers and their schemas, and how to send logs to external aggregators such as Splunk, Loggly, Sumologic, and the Elastic stack.
weight: 60
---

Logging is a feature that provides the capability to send detailed logs to several kinds of 3rd party external log aggregation services. Services connected to this data feed serve as a useful means in gaining insight into Ascender usage or technical trends. The data can be used to analyze events in the infrastructure, monitor for anomalies, and correlate events from one service with events in another. The types of data that are most useful to Ascender are job fact data, job events/job runs, activity stream data, and log messages. The data is sent in JSON format over an HTTP connection using minimal service-specific tweaks engineered in a custom handler or via an imported library.

## Ascender Logfiles

The Ascender logfiles are streamed real-time on the console.

## Delivery and Queueing

The `ascender-web` and `ascender-task` processes send their logs directly to the external log aggregator; there is no separate log relay. Each process keeps its own queue of the logs it has not sent yet, so a slow or offline log aggregator never holds up a request or a job. While the log aggregator cannot be reached, the oldest log is tried again every **TCP Connection Timeout** seconds and the others wait behind it. Once the queue in memory is 75% full, new logs are written to disk until they have all been sent.

You can configure from the `/api/v2/settings/logging/` endpoint how the queue uses the disk in the event that your external logger goes offline:

- `LOG_AGGREGATOR_ACTION_MAX_DISK_USAGE_GB`: specifies the amount of data to store (in gigabytes) during an outage of the external log aggregator (defaults to 1).
- `LOG_AGGREGATOR_MAX_DISK_USAGE_PATH`: specifies the location to persist logs that should be retried after an outage of the external log aggregator (defaults to `/var/lib/ascender`).

For example, if Splunk goes offline, each process stores its queue on the disk until Splunk comes back online. By default, it will store up to 1GB of events (while Splunk is offline) but you can make that more than 1GB if necessary, or change the path where you save the queue. Logs still in memory when a process is stopped abruptly are lost.

## Loggers

Below are special loggers (except for `ascender`, which constitutes generic server logs) that provide a large amount of information in a predictable structured or semi-structured format, following the same structure as one would expect if obtaining the data from the API:

- `job_events`: Provides data returned from the Ansible callback module
- `activity_stream`: Displays the record of changes to the objects within the Ascender application
- `system_tracking`: Nothing is sent on this logger. The facts gathered by the Ansible `setup` module (that is, `gather_facts: True`) when job templates are run with **Enable Fact Cache** selected are sent as `ascender` server logs instead (see [Fact records](#fact-records)), so they are only sent while `ascender` is selected.
- `ascender`: Provides generic server logs, which include logs that would normally be written to a file. It contains the standard metadata that all logs have, except it only has the message from the log statement. `awx`, the name used by installations from before the rename, selects the same logs.

These loggers only use a log-level of INFO, except for the `ascender` logger, which may be any given level.

Additionally, the standard Ascender logs are deliverable through this same mechanism. It is apparent how to enable or disable each of these five sources of data without manipulating a complex dictionary in your local settings file, as well as adjust the log-level consumed from the standard Ascender logs.

To configure various logging components in Ascender, click **Settings** from the left navigation bar then select **Logging settings** from the list of System options.

### Log message schema

Common schema for all loggers:

- `@timestamp`: Time of log
- `message`: The log message
- `host`: Host name of the machine or container that sent the log
- `level`: Standard python log level, roughly reflecting the significance of the event. All of the data loggers as a part of this feature use INFO level, but the other Ascender logs will use different levels as appropriate
- `logger_name`: Full name of the logger, for example, "ascender.analytics.activity_stream"
- `cluster_host_id`: Unique identifier of the host within the Ascender cluster
- `tower_uuid`: Unique identifier of the Ascender installation
- `tower_url`: The **Base URL of the service** setting (`ASCENDER_URL_BASE`)

### Activity stream schema

- (common): This uses all the fields common to all loggers listed above
- `actor`: Username of the user who took the action documented in the log
- `changes`: JSON summary of what fields changed, and their old/new values.
- `operation`: The basic category of the change logged in the activity stream, for instance, "associate".
- `object1`: Information about the primary object being operated on, consistent with what we show in the activity stream
- `object2`: If applicable, the second object involved in the action

### Job event schema

This logger reflects the data being saved into job events, with each field of the event under its own name. Notably, `host` is the ID of the host the event is for, and `host_name` its name. There is also a sub-dictionary field, `event_data` within the payload, which contains different fields depending on the specifics of the Ansible event, and an `event_display` field with the event's description.

This logger also includes the common fields.

### Fact records

When a job run with **Enable Fact Cache** selected changes the facts of a host, an `ascender` server log is sent with the message `New fact for inventory <inventory> host <host>`.

- (common): This uses all the fields common to all loggers listed above
- `inventory_id`: ID of the inventory the host is in
- `host_name`: Name of the host
- `ansible_facts`: The facts of the host
- `ansible_facts_modified`: Time the facts were changed
- `job_id`: ID of the job that gathered the facts

When a job clears the facts of a host, the message is `Facts cleared for inventory <inventory> host <host>`, with no additional fields.

### Job status changes

This is intended to be a lower-volume source of information about changes in job states compared to job events, and also intended to capture changes to types of unified jobs other than job template based jobs.

These logs are sent on the `job_lifecycle` logger, one for each step a job goes through. In addition to common fields, they include:

- `lifecycle_data`: The job's `type`, `task_id`, `state` (the step), `work_unit_id` and `task_name`, and on the steps that choose them, `controller_node` or `execution_node`
- `organization_id`: ID of the job's organization

### Ascender logs

The log message is in the common `message` field. These logs can be enabled or disabled with the **Enable External Logging** option from the Logging settings page.

## Set Up Logging

### Log Aggregation

To set up logging to any of the aggregator types:

1. Click **Settings** from the left navigation bar.
2. Under the list of System options, click to select **Logging settings**.
3. At the bottom of the Logging settings screen, click **Edit**.
4. Set the configurable options from the fields provided:

   - **Enable External Logging**: Click the toggle button to **ON** if you want to send logs to an external log aggregator.
   - **Logging Aggregator**: Enter the hostname or IP address you want to send logs.
   - **Logging Aggregator Port**: Specify the port for the aggregator if it requires one.

     When the connection type is HTTPS, you can enter the hostname as a URL with a port number and therefore, you are not required to enter the port again. But TCP, UDP and RELP connections are determined by the hostname and port number combination, rather than URL. So in the case of a TCP, UDP or RELP connection, enter only a hostname or IP address in the **Logging Aggregator** field, not a URL, and supply the port in the specified field, which these protocols require.

   - **Logging Aggregator Type**: Click to select the aggregator service from the drop-down menu:

     ![Logging Aggregator Type drop-down menu listing the supported aggregator services](/assets/images/configure-ascender-system-logging-types.webp)

   - **Logging Aggregator Username**: Enter the username of the logging aggregator if it requires it.
   - **Logging Aggregator Password/Token**: Enter the password of the logging aggregator if it requires it.
   - **Log System Tracking Facts Individually**: Click the tooltip (question mark) icon for additional information whether or not you want to turn it on, or leave it off by default.
   - **Logging Aggregator Protocol**: Click to select a connection type (protocol) to communicate with the log aggregator. Subsequent options vary depending on the selected protocol.
   - **Logging Aggregator Level Threshold**: Select the level of severity you want the log handler to report.
   - **TCP Connection Timeout**: Specify the connection timeout in seconds. This option is only applicable to HTTPS, TCP and RELP log aggregator protocols.
   - **Enable/disable HTTPS certificate verification**: Certificate verification is enabled by default for HTTPS log protocol. Click the toggle button to **OFF** if you do not want the log handler to verify the HTTPS certificate sent by the external log aggregator before establishing a connection.
   - **Loggers Sending Data to Log Aggregator Form**: Six loggers are selected by default: `ascender`, `activity_stream`, `job_events`, `system_tracking`, `broadcast_websocket` and `job_lifecycle`. Click the tooltip (question mark) icon next to the field for additional information on each logger. Delete the loggers you do not want.
   - **Log Format For API 4XX Errors**: Configure a specific error message. See [API 4XX Error Configuration](#api-4xx-error-configuration) for further detail.

5. Review your entries for your chosen logging aggregation. Below is an example of one set up for Splunk:

   ![Logging settings configured for a Splunk aggregator](/assets/images/configure-ascender-system-logging-splunk-example.webp)

6. When done, click **Save** to apply the settings or **Cancel** to abandon the changes.
7. To verify if your configuration is set up correctly, send a test log message through the API as a system administrator. This sends the message `Ascender Connection Test Message` to the log aggregator using the saved logging configuration in Ascender. You should check to make sure this test message was received by your external log aggregator.

   ```bash
   curl -k -X POST --user admin:password https://<ascender_host>/api/v2/settings/logging/test/
   ```

<Hint type="note">

The settings page has no test button; the test is only available through the API. It answers `202` when the message was sent and `409` when **Enable External Logging** is set to OFF. For TCP, UDP and RELP, it answers `400` with an error message when the port is missing or cannot be connected to.

</Hint>

### API 4XX Error Configuration

When the API encounters an issue with a request, it will typically return an HTTP error code in the 400 range along with an error. When this happens, an error message will be generated in the log which follows the pattern:

```text
status {status_code} received by user {user_name} attempting to access {url_path} from {remote_addr}
```

These messages can be configured as required. To modify the default API 4XX errors log message format, do the following:

1. Click **Settings** from the left navigation bar.
2. Under the list of System options, click to select **Logging settings**.
3. At the bottom of the Logging settings screen, click **Edit**.
4. Modify the field **Log Format For API 4XX Errors**.

Items surrounded by `{}` will be substituted when the log error is generated. The following variables can be used:

- **status_code**: The HTTP status code the API is returning
- **user_name**: The name of the user that was authenticated when making the API request
- **url_path**: The path portion of the URL being called (aka the API endpoint)
- **remote_addr**: The remote address received by Ascender
- **error**: The error message returned by the API or, if no error is specified, the HTTP status as text

## Troubleshoot Logging

### API 4XX Errors

You can include the API error message for 4XX errors by modifying the log format for those messages. Refer to the [API 4XX Error Configuration](#api-4xx-error-configuration) section for more detail.

### LDAP

You can enable logging messages for the LDAP adapter. Refer to the [Enabling logging for LDAP](../authentication/ldap#enabling-logging-for-ldap) section for more detail.

### SAML

You can enable logging messages for the SAML adapter the same way you can enable logging for LDAP. Refer to the [Enabling logging for LDAP](../authentication/ldap#enabling-logging-for-ldap) section for more detail.
