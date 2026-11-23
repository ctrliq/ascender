---
title: Management Jobs
description: Launch, schedule, and set notifications for the Ascender management jobs that clean up old activity streams, tokens, sessions, and job history.
weight: 50
---

**Management Jobs** assist in the cleaning of old data from Ascender, including expired sessions, tokens, job histories, and activity streams. You can use this if you have specific retention policies or need to decrease the storage used by your Ascender database. Click **Management Jobs** from the left navigation bar.

![Management Jobs list showing the cleanup jobs available to launch or schedule](/assets/images/ug-management-jobs.webp)

Several job types are available for you to schedule and launch:

- **Cleanup Activity Stream**: Remove activity stream history older than a specified number of days
- **Cleanup Expired OAuth 2 Tokens**: Remove expired OAuth 2 access tokens and refresh tokens
- **Cleanup Expired Sessions**: Remove expired browser sessions from the database
- **Cleanup Job Details**: Remove job history older than a specified number of days

## Removing Old Activity Stream Data

To remove older activity stream data, click **Launch** (rocket icon) beside **Cleanup Activity Stream**.

![Cleanup Activity Stream launch dialog prompting for the number of days of data to keep](/assets/images/ug-management-jobs-remove-activity-stream-launch.webp)

Enter the number of days of data you would like to save and click **Launch**.

### Scheduling

To review or set a schedule for purging data marked for deletion:

1. For a particular cleanup job, click the **Schedules** tab.

   ![Schedules tab of the Cleanup Activity Stream management job](/assets/images/ug-management-jobs-remove-activity-stream-schedule.webp)

   Note that you can turn this scheduled management job on and off easily using the **ON/OFF** toggle button.

2. Click on the name of the job, in this example "Cleanup Activity Schedule", to review the schedule settings and click **Edit** to modify them. You can also use the **Add** button to create a new schedule for this management job.

   ![Schedule details for the Cleanup Activity Schedule](/assets/images/ug-management-jobs-remove-activity-stream-schedule-details.webp)

3. Enter the appropriate details into the following fields and click **Save**:

   - Name (required)
   - Start Date (required)
   - Start Time (required)
   - Local Time Zone (the entered Start Time should be in this timezone)
   - Repeat Frequency (the appropriate options display as the update frequency is modified including data you do not want to include by specifying exceptions)
   - Days of Data to Keep (required) - specify how much data you want to retain

The **Details** tab displays a description of the schedule and a list of the scheduled occurrences in the selected Local Time Zone.

<Hint type="note">

Jobs are scheduled in UTC. Repeating jobs that run at a specific time of day may move relative to a local timezone when Daylight Saving Time shifts occur.

</Hint>

### Notifications

To review or set notifications associated with a management job:

1. For a particular cleanup job, click the **Notifications** tab.

   ![Notifications tab of a management job listing notification templates](/assets/images/management-job-notifications.webp)

If none exist, see [Notifications](/user-guide/notifications) for more information.

![Notifications tab of a management job with no notification templates](/assets/images/management-job-notifications-empty.webp)

An example of a notification with details specified:

![Notification template details for a management job](/assets/images/management-job-add-notification-details.webp)

## Cleanup Expired OAuth 2 Tokens

To remove expired OAuth 2 tokens, click **Launch** (rocket icon) beside **Cleanup Expired OAuth 2 Tokens**.

You can review or set a schedule for cleaning up expired OAuth 2 tokens by performing the same procedure described for activity stream management jobs. See [Scheduling](#scheduling) for detail.

You can also set or review notifications associated with this management job the same way as described in [Notifications](#notifications) for activity stream management jobs, and refer to [Notifications](/user-guide/notifications) for more detail.

## Cleanup Expired Sessions

To remove expired sessions, click **Launch** (rocket icon) beside **Cleanup Expired Sessions**.

You can review or set a schedule for cleaning up expired sessions by performing the same procedure described for activity stream management jobs. See [Scheduling](#scheduling) for detail.

You can also set or review notifications associated with this management job the same way as described in [Notifications](#notifications) for activity stream management jobs, and refer to [Notifications](/user-guide/notifications) for more detail.

## Removing Old Job History

To remove job history older than a specified number of days, click **Launch** (rocket icon) beside **Cleanup Job Details**.

![Cleanup Job Details launch dialog prompting for the number of days of data to keep](/assets/images/ug-management-jobs-cleanup-job-launch.webp)

Enter the number of days of data you would like to save and click **Launch**.

<Hint type="note">

**Cleanup Job Details** keeps the current and last update of each source control project and of each inventory source, whatever their age, and skips jobs that are still pending, waiting, or running.

</Hint>

You can review or set a schedule for cleaning up old job history by performing the same procedure described for activity stream management jobs. See [Scheduling](#scheduling) for detail.

You can also set or review notifications associated with this management job the same way as described in [Notifications](#notifications) for activity stream management jobs, and refer to [Notifications](/user-guide/notifications) for more detail.
