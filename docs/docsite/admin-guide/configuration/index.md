---
title: Ascender Configuration
description: Configure Ascender authentication, jobs, system, and user interface settings from the Settings screen, and control job isolation paths.
weight: 1
---

You can configure various Ascender settings within the Settings screen in the following tabs:

![Ascender Settings screen listing the Authentication, Jobs, System, User Interface, and Troubleshooting settings groups](/assets/images/ug-settings-menu-screen.webp)

Each field on an edit form has a **Revert** button, which puts that value back to its default. **Revert all to default** reverts every value on the form to its factory default, after you confirm it.

**Save** applies the changes you make and returns to the details view of those settings. **Cancel** returns to the details view without saving.

## Authentication

Through the Ascender user interface, you can set up a simplified login through various authentication types: GitHub, Google, LDAP, SAML, and OIDC. The **Authentication** group of the Settings screen lists each available method. See [Authentication](../authentication) for how to configure each one.

## Jobs

The Jobs tab allows you to configure the types of modules that are allowed to be used by Ascender's Ad Hoc Commands feature, set limits on the number of jobs that can be scheduled, define their output size, and other details pertaining to working with Jobs in Ascender.

1. From the left navigation bar, click **Settings** and select **Jobs settings** from the Settings screen.
2. Set the configurable options from the fields provided. Click the **Help** (tooltip) icon next to the field that you need additional information or details about. Refer to the [Ansible Galaxy support](/user-guide/projects#ansible-galaxy-support) section for details about configuring Galaxy settings.

    **Note:** The values for all the timeouts are in seconds.

    ![Jobs settings screen showing the configurable job options](/assets/images/configure-ascender-jobs.webp)

3. Click **Save** to apply the settings or **Cancel** to abandon the changes.

## System

The System tab allows you to define the base URL for the Ascender host, enable activity capturing, control visibility of users, and configure logging aggregation options.

1. From the left navigation bar, click **Settings**.
2. The right side of the Settings window is a set of configurable System settings. Select from the following options:

    - **Miscellaneous System settings**: enable activity streams, specify the default execution environment, define the base URL for the Ascender host, configure workload identity, set user and system role visibility, choose what organization administrators can manage, allow AWS Secrets Manager default credentials, and set the remote host headers, proxy IP allowed list, and CSRF trusted origins.
    - **Miscellaneous Authentication settings**: configure options associated with authentication methods (built-in or SSO), sessions (timeout, number of sessions logged in, tokens), and social authentication mapping.
    - **Logging settings**: configure logging options based on the type you choose:

         ![Logging settings shown with the list of options for Logging Aggregator Types](/assets/images/configure-ascender-system-logging-types.webp)

         For more information about each of the logging aggregation types, refer to the [Logging](../logging) section of the [Ascender admin guides](..).

3. Set the configurable options from the fields provided. Click the **Help** (tooltip) icon next to the field that you need additional information or details about. Below is an example of the System settings window.

    ![Miscellaneous System settings window showing all possible configurable options](/assets/images/configure-ascender-system.webp)

    **Note:** The **Allow External Users to Create Oauth2 Tokens** setting is disabled by default. This ensures external users cannot *create* their own tokens. If you enable then disable it, any tokens created by external users in the meantime will still exist, and are not automatically revoked.

4. Click **Save** to apply the settings or **Cancel** to abandon the changes.

## User Interface

Ascender supports rebranding the login screen, the application header, and the browser tab title, and adding your own notice to the login screen. All of these are configured from the **User Interface settings** of the Settings menu.

![Edit User Interface Settings form with the custom logo, header logo, browser title, and login info fields](/assets/images/configure-ascender-ui.webp)

<Hint type="note">

The settings described here apply to Ascender 25.4.0 and later.

</Hint>

### Custom logos

There are two logo settings:

**Custom Login Logo** (`CUSTOM_LOGO`) replaces the Ascender logo on the login screen.

**Custom Header Logo** (`CUSTOM_HEADER_LOGO`) replaces the Ascender logo in the application header that is shown on every page after login.

If you are upgrading from a release where you had set the older **Custom Menu Logo** option, that value does not carry forward. The header logo is a separate setting, so upload your logo again here.

Both settings accept GIF, PNG, and JPEG images. SVG is not supported. Use a `.png` file with a transparent background for the best result.

The two logos are sized on different axes: the login logo is capped at 192 pixels wide, and the header logo at 46 pixels tall. Each scales to fit, so keep the aspect ratio in mind when choosing an image.

Each logo is stored as a base64-encoded data URL, in the form `data:image/png;base64,<encoded data>`. The Settings form encodes the file for you on upload. If you set either value through the API instead, supply the full data URL yourself.

There is no enforced file size limit, but keep the images small. Both values are stored as settings and served to the browser on page load, so a large image slows down the initial render for every user.

Once a file is uploaded, the form shows a preview of each logo:

![Edit User Interface Settings form with both logo settings populated and showing previews](/assets/images/configure-ascender-ui-logo-filled.webp)

After saving, the login screen uses the **Custom Login Logo** in place of the Ascender logo:

![Ascender login screen showing a custom login logo](/assets/images/configure-ascender-ui-custom-login.webp)

The **Custom Header Logo** replaces the Ascender logo in the header, which appears on every page once you are logged in:

![Ascender dashboard showing a custom logo in the application header](/assets/images/configure-ascender-header-logo.webp)

### Custom browser title

**Custom Browser Title** (`CUSTOM_TITLE`) replaces the default brand name in the browser tab title throughout the application. With it set, tab titles read `<your title> | Jobs` rather than `Ascender | Jobs`, and the login page tab shows your title on its own. Leave it blank to fall back to the default brand name, `Ascender`.

The new title appears on the next page each user opens.

### Custom login info

**Custom Login Info** (`CUSTOM_LOGIN_INFO`) adds a block of text to the login screen, such as a legal notice or a disclaimer. Use plain text or an HTML fragment; other markup languages are not supported.

### Reverting to the defaults

Each setting has its own **Revert** control, which restores that one setting. **Revert all to default** resets every UI setting, including ones that are not on this form such as the maximum job events retrieved by the UI and live updates, so use the per-setting control if you only mean to drop a logo.

Reverting these settings restores the standard Ascender logo and brand name:

![Ascender login screen with the default Ascender logo](/assets/images/login-form.webp)

## Isolation functionality and variables

Ascender uses container technology to isolate jobs from each other. By default, only the current project is exposed to the container running a job template.

You may find that you need to customize your playbook runs to expose additional directories. To fine tune your usage of job isolation, there are certain variables that can be set.

By default, Ascender will use the system's `tmp` directory (`/tmp` by default) as its staging area. This can be changed in the **Job execution path** field of the Jobs settings screen, or with the `ASCENDER_ISOLATION_BASE_PATH` setting in a `PATCH` to `/api/v2/settings/jobs/`:

```json
{"ASCENDER_ISOLATION_BASE_PATH": "/opt/tmp"}
```

If there are any additional directories that should specifically be exposed from the host to the container that playbooks run in, you can specify those in the **Paths to expose to isolated jobs** field of the Jobs setting screen, or with the `ASCENDER_ISOLATION_SHOW_PATHS` setting in a `PATCH` to `/api/v2/settings/jobs/`:

```json
{"ASCENDER_ISOLATION_SHOW_PATHS": ["/list/of/", "/paths"]}
```

<Hint type="note">

The primary file you may want to add to `ASCENDER_ISOLATION_SHOW_PATHS` is `/var/lib/ascender/.ssh`, if your playbooks need to use keys or settings defined there.

</Hint>

The above fields can be found in the Jobs Settings window:

![Jobs settings showing the Job Execution Path and Paths to Expose to Isolated Jobs fields](/assets/images/configure-ascender-jobs-isolated-jobs-fields.webp)
