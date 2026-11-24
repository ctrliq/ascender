---
title: The User Interface
description: Log in to Ascender, choose a theme, find your way around the dashboard, views, menus, and settings, and search and sort lists.
weight: 3
---

The User Interface offers a friendly graphical framework for your IT orchestration needs. The left navigation bar provides quick access to resources, such as **Projects**, **Inventories**, **Templates**, and **Jobs**.

Across the top-right side of the interface, you can access your user profile, the About page, view related documentation, and log out. Right below these options, you can view the activity stream for that user by clicking the **Activity Stream** (clock) icon.

![Main screen with arrow showing where the activity stream icon resides on the Dashboard](/assets/images/ug-dashboard-top-nav.webp)

## Logging In

To log in, browse to the user interface at: `http://<server name>/`

![Ascender login form](/assets/images/login-form.webp)

Log in using a valid username and password.

The default username is `admin`, and the default password is set during installation. To configure users and passwords, you can do so by accessing **Users** from the left navigation bar.

## Themes

Ascender ships four themes. **Default** and **Dark** are dark; **Light** and **Classic** are light. A new installation uses **Default**.

Choose one from the palette icon in the top navigation bar, or from the **Preferred Theme** field on your own user's edit form. That field appears only when you are editing your own user, so you cannot set a theme on someone else's behalf.

![Theme drop-down open from the palette icon in the top navigation bar, listing Classic, Dark, Default, and Light with Default selected](/assets/images/ug-theme-selector.webp)

The choice is stored on your Ascender account, so it follows you to any browser or machine you sign in from, including sign-ins through SAML or another single sign-on provider. Picking a theme from the palette icon saves it to your account too. A theme chosen in a browser before this preference existed on the account is not carried over, so pick it once more and it will be saved to the account. In the API, the preference is the `preferred_theme` field of the user.

## Views

The User Interface provides several options for viewing information.

### Dashboard view

The **Dashboard** view begins with a summary of your hosts, inventories, and projects. Each of these is linked to the corresponding objects for easy access.

![Dashboard showing a summary of your hosts, inventories, and projects, and job run statuses](/assets/images/ug-dashboard-topsummary.webp)

On the main Dashboard screen, a summary appears listing your current **Job Status**. The **Job Status** graph displays the number of successful and failed jobs over a specified time period. You can choose to limit the job types that are viewed, and to change the time horizon of the graph.

Also available for view are summaries of **Recent Jobs** and **Recent Templates** on their respective tabs.

The **Recent Jobs** section displays which jobs were most recently run, their status, and time when they were run as well.

![Summary of the most recently used jobs](/assets/images/ug-dashboard-recent-jobs.webp)

The **Recent Templates** section of this display shows a summary of the most recently used templates. You can also access this summary by clicking **Templates** from the left navigation bar.

![Summary of the most recently used templates](/assets/images/ug-dashboard-recent-templates.webp)

<Hint type="note">

Clicking on **Dashboard** from the left navigation bar or the Ascender logo at any time returns you to the Dashboard.

</Hint>

### Jobs view

Access the **Jobs** view by clicking **Jobs** from the left navigation bar. This view shows all the jobs that have run, including projects, templates, management jobs, SCM updates, playbook runs, etc.

![Jobs view showing jobs that have run, including projects, templates, management jobs, SCM updates, and playbook runs](/assets/images/ug-dashboard-jobs-view.webp)

### Schedules view

Access the Schedules view by clicking **Schedules** from the left navigation bar. This view shows all the scheduled jobs that are configured.

![Schedules view showing all the scheduled jobs that are configured](/assets/images/ug-dashboard-schedule-view.webp)

### Activity Stream

Most screens have an **Activity Stream** (clock) icon. Clicking this brings up the **Activity Stream** for this object.

![Summary of the recent activity on the Activity Stream dashboard](/assets/images/users-activity-stream.webp)

An Activity Stream shows all changes for a particular object. For each change, the Activity Stream shows the time of the event, the user that initiated the event, and the action. The information displayed varies depending on the type of event. Clicking the **Examine** (magnifying glass) icon shows the event log for the change.

![Example of an event log of an Activity Stream instance](/assets/images/activity-stream-event-log.webp)

The Activity Stream can be filtered by the initiating user (or the system, if it was system initiated), and by any related object, such as a particular credential, job template, or schedule.

The Activity Stream on the main Dashboard shows the Activity Stream for the entire instance. Most pages allow viewing an activity stream filtered for that specific object.

### Workflow Approvals

Access this view to see your workflow approval queue. The list contains actions that require you to approve or deny before a job can proceed. See [Approval nodes](../workflow-templates#approval-nodes) for further detail.

## Resources and Access

The **Resources** and **Access** menus provide you access to the various components of Ascender and allow you to configure who has permissions for those resources:

- [Labels](../labels)
- Templates ([Job Templates](../job-templates) and [Workflow Job Templates](../workflow-templates))
- [Credentials](../credentials)
- [Projects](../projects)
- [Inventories](../inventories)
- [Hosts](../inventories#add-hosts)
- [Organizations](../organizations)
- [Users](../users)
- [Teams](../teams)

## Administration

The **Administration** menu provides access to the various administrative options. From here, you can create, view, and edit:

- [Credential Types](../credential-types)
- [Notifications](../notifications)
- [Management Jobs](/admin-guide/management-jobs)
- [Instance Groups](../instance-groups)
- [Instances](/admin-guide/instances)
- [Applications](../applications)
- [Execution Environments](../execution-environments)
- [Topology Viewer](/admin-guide/topology-viewer)

## The Settings Menu

Configuring global and system-level settings is accomplished through the **Settings** menu, which is described in further detail in the proceeding section. The **Settings** menu offers access to administrative configuration options.

To enter the Settings window for Ascender, click **Settings** from the left navigation bar. This page allows you to modify your Ascender configuration, such as settings associated with authentication, jobs, system, and user interface.

![The main settings window for Ascender](/assets/images/ug-settings-menu-screen.webp)

For more information on configuring these settings, refer to the [Configuration](/admin-guide/configuration) section of the [Ascender Administration Guide](/admin-guide).

## Code and Variables Editors

Fields that hold YAML, JSON, or templates, such as **Variables**, open in a code editor. When you edit one, it grows to fit its content, up to 50 lines, and scrolls after that.

You can drag the handle in an editor's bottom-right corner to set its height yourself. Every editor you can type in has the handle. Of the read-only views, only the **Variables**, **Facts**, and other variables displays on detail pages have it. Once you drag it, the editor keeps that height and scrolls inside it instead of growing. Your browser remembers the height for that field, so every editor for the same field, on any record, opens at that height. Double-click the handle to go back to the default size and forget the saved height.

## Search

Every list has a search toolbar for filtering what it shows. It has a key drop-down, which starts on the list's first key (usually **Name**), and a text box beside it. Choose a key, enter a value, and press Enter or click the search button. Keys with fixed choices, such as **Job Type** and **Status** on the Jobs list, show a **Filter By** list instead of a text box, where you check one or more values. The last entry in the key drop-down, **Advanced**, replaces the text box with the advanced search, which can filter on any field the API allows.

![Advanced search options showing the Set Type, Key, and Lookup type drop-downs](/assets/images/search-bar-key.webp)

### Simple search

Each key in the drop-down stands for one API filter, with its own lookup. The Jobs list, for example, offers these keys:

| Key | Filter sent to the API |
| --- | --- |
| **Name** | `name__icontains=<value>` (case-insensitive contains) |
| **ID** | `id=<value>` (exact match) |
| **Label Name** | `labels__name__icontains=<value>` |
| **Job Type** | `or__type=<value>` |
| **Launched By (Username)** | `created_by__username__icontains=<value>` |
| **Status** | `or__status=<value>` |
| **Limit** | `job__limit=<value>` (exact match) |

Its **Created** and **Finished** keys filter on dates, as described in [Date filtering](#date-filtering).

The value is sent exactly as you enter it, under the chosen key. The text box has no `field:value` syntax: with the **Name** key, entering `name:localhost` looks for names that contain `name:localhost`.

The simple keys do not send the API's generic `search` parameter, with one exception: the **Keyword** key of the Activity Stream, which sends `search=<value>` and matches the text of each entry's changes. Elsewhere, related objects can be searched this way in advanced search, with a related key's `search` lookup.

### Advanced search

Choose **Advanced** from the key drop-down to build a filter from three parts and a value:

- **Set type**: how the filter combines with the others.
  - **and**: returns results that satisfy this filter as well as the other filters. This is the default if nothing is selected.
  - **or**: returns results that satisfy this filter or any other **or** filter.
  - **not**: returns results whose value is something other than this one, as well as satisfying the other filters.
- **Key**: the field to filter on. **Direct Keys** are the list's own fields; **Related Keys** are related objects, such as `organization` or `project`.
- **Lookup type** (for a direct key): how the value is compared, such as **exact**, **icontains**, **startswith**, **regex**, **gt** or **lt**, **isnull** (expects a boolean), or **in** (expects a comma-separated list). The lookups offered depend on the field's type.
- **Related search type** (for a related key): `name__icontains` (case-insensitive search on the related object's name, the default), `name` (exact name), `id` (exact ID), or `search` (case-insensitive search on the related object's text fields, such as its name and description). The set type is disabled for a `search` lookup.

The parts are joined into one query parameter: the set type (left out for **and**), the key, and the lookup. For example, set type **or**, key `name` and lookup **startswith** with the value `web` sends `or__name__startswith=web`; key `organization` with the default related search type and the value `Default` sends `organization__name__icontains=Default`.

#### Values for search fields

The keys come from the list's API endpoint. The **Direct Keys** are the fields the endpoint's **OPTIONS** response marks as filterable, and the **Related Keys** are its `related_search_fields`, with `__search` stripped from the end. To find the valid values for a field, look at the same **OPTIONS** response: for the `status` field of `/api/v2/jobs/`, for example, the choices listed under `"status"` are `new`, `pending`, `waiting`, `running`, `successful`, `failed`, `error`, and `canceled`. The related search fields of `/api/v2/jobs/` are:

```json
"related_search_fields": [
    "organization__search",
    "hosts__search",
    "unifiedjob_blocked_jobs__search",
    "modified_by__search",
    "launch_config__search",
    "credentials__search",
    "inventory__search",
    "unifiedjob_ptr__search",
    "project_update__search",
    "notifications__search",
    "instance_group__search",
    "schedule__search",
    "execution_environment__search",
    "dependent_jobs__search",
    "project__search",
    "job_template__search",
    "retried_workflow_nodes__search",
    "created_by__search",
    "unified_job_node__search",
    "unified_job_template__search",
    "labels__search",
    "job_host_summaries__search",
    "webhook_credential__search",
    "job_events__search"
]
```

### Combining filters

Each search adds a filter, shown as a chip below the toolbar. Remove one with its close button, or remove them all with **Clear all filters**.

Filters combine: a list shows only the items that match all of them. Filters with the **or** set type are the exception: together they form one group that matches when any of them matches, and that group combines with the other filters. The Jobs list's **Job Type** and **Status** keys are **or** filters, so checking **Failed** and **Error** under **Status** lists the jobs that failed or ended in an error.

### Date filtering

Two lists can filter on a date field: **Jobs**, on its **Created** and **Finished** columns, and **Activity Stream**, on **Time**. The job list is reused on the job tabs of templates, inventories, hosts, and the dashboard, so the same filters are available there.

Selecting one of those columns replaces the search field's text box with a date input and an operator drop-down:

![Jobs list search toolbar with the Created column selected, showing the date operator drop-down expanded and a date input](/assets/images/search-date-filter.webp)

Pick an operator and a date, then click the search button. **On or after** matches the date and everything later, sending `<field>__gte` to the API. **Before** matches everything strictly earlier than the date, sending `<field>__lt`. The date box displays the date in your browser's local format, but Ascender submits it as `YYYY-MM-DD`, so filtering the Jobs list for jobs created on or after June 1, 2026 sends `created__gte=2026-06-01` and the applied filter reads `Created (created__gte)`.

Date filters combine with each other and with other search terms, so applying both operators to the same column selects a range: `created__gte=2026-06-01` with `created__lt=2026-07-01` returns the jobs created during June 2026.

<Hint type="note">

Date filters are evaluated in UTC, while the **Finish Time** column displays timestamps in your own time zone, so results close to a boundary can look off by a few hours. Filtering on **Finished** also excludes any job that has not finished, since those have no finish time yet.

</Hint>

### Sort

Where applicable, use the arrows in each column to sort by ascending or descending order (following is an example from the schedules list).

![Schedules list with sort arrows in the column headers](/assets/images/sort-order-example.webp)

The direction of the arrow indicates the sort order of the column.
