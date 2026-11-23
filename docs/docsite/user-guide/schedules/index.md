---
title: Schedules
description: View all configured schedules and add schedules to templates, projects, and inventory sources.
weight: 66
---

You can access all your configured schedules by clicking **Schedules** from the left navigation bar. The schedules list may be sorted by any of the attributes from each column using the directional arrows. You can also search by name, by description, or by the username of whoever created or last modified a schedule.

Each schedule has a corresponding **Actions** column that has options to enable/disable that schedule using the **ON/OFF** toggle next to the schedule name and to allow editing (**Edit**, pencil icon) of that schedule.

![Schedules list showing sample schedules with their toggles and actions](/assets/images/schedules-sample-list.webp)

If you are setting up a template, a project, or an inventory source, clicking on the **Schedules** tab allows you to configure schedules for these resources. Once schedules are created, they are listed by:

- **Name**: Clicking the schedule name opens its details
- **Related resource**: The template, project, or inventory source the schedule runs; clicking it opens that resource
- **Resource type**: The kind of job the schedule launches: Playbook Run, Workflow Job, Source Control Update, Inventory Sync, or Management Job
- **Next Run**: The next scheduled run of this task

![Schedules tab of a resource listing its schedules](/assets/images/generic-schedules-example-list.webp)

## Add a new schedule

Schedules can only be created from a template, project, or inventory source, and not directly on the main **Schedules** screen itself. To create a new schedule:

1. Click the **Schedules** tab of the resource you are configuring (template, project, or inventory source).
2. Click the **Add** button, which opens the **Create Schedule** window.

   ![Create Schedule window](/assets/images/generic-create-schedule.webp)

3. Enter the appropriate details into the following fields:
   - **Name** (required)
   - **Start Date** (required)
   - **Start Time** (required)
   - **Local Time Zone** - The entered Start Time should be in this timezone
   - **Repeat Frequency** - Appropriate scheduling options display depending on the frequency you select

   The **Schedule Details** displays when you established a schedule, allowing you to review the schedule settings and a list of the scheduled occurrences in the selected Local Time Zone.

   ![Schedule Details showing the schedule settings and upcoming occurrences](/assets/images/generic-create-schedule-details.webp)

4. Once done, click **Save**.

<Hint type="note">

A schedule keeps the **Local Time Zone** you select, and its runs follow that zone's wall-clock time across Daylight Saving Time changes: a schedule set for 09:00 in America/New_York runs at 09:00 New York time all year. A run whose time does not exist on the day the clocks change (such as 02:30 when the clocks jump from 02:00 to 03:00) is skipped. Select UTC as the time zone if you want a schedule to run at a fixed UTC time.

</Hint>

You can use the **ON/OFF** toggle button to stop an active schedule or activate a stopped schedule.

![Schedules list with a configured schedule and its ON/OFF toggle](/assets/images/generic-schedules-list-configured.webp)
