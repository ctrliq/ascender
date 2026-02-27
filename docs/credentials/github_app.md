# GitHub App Installation Access Token Lookup

## Overview

The **GitHub App Installation Access Token Lookup** credential plugin allows Ascender to authenticate with GitHub using a GitHub App instead of personal access tokens or deploy keys. This is the recommended way to access private GitHub repositories for source control, as GitHub App tokens are scoped, short-lived, and auditable.

## Prerequisites

1. **A GitHub App** created by your GitHub organization admin.
   - See [Creating GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps).
2. **The App installed** on the target organization or repository.
   - See [Installing GitHub Apps](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app).
3. The following information from your GitHub Admin:
   - **App ID** (or Client ID) — found on `https://github.com/settings/apps/<app-name>`
   - **Installation ID** — extracted from the installation URL, e.g. `https://github.com/settings/installations/59980338`
   - **Private RSA key** — the PEM file generated for the App

## Setting up the lookup credential

1. Navigate to **Resources → Credentials** and click **Add**.
2. Select **GitHub App Installation Access Token Lookup** as the **Credential Type**.
3. Fill in the following fields:

   | Field | Description |
   |-------|-------------|
   | **GitHub API endpoint URL** | The GitHub API URL. Use `https://api.github.com` for github.com, `https://gh.your.org/api/v3` for self-hosted GitHub Enterprise, or `https://api.SUBDOMAIN.ghe.com` for GitHub Enterprise Cloud. |
   | **GitHub App ID or Client ID** | The App ID (e.g. `1121547`) or Client ID (e.g. `Iv23likIfIXeZTb5GCAA`) from your GitHub App settings. |
   | **GitHub App Installation ID** | The Installation ID (e.g. `59980338`) from the installation link. |
   | **RSA Private Key** | The full contents of the PEM file provided by the GitHub Admin. |

4. Click **Save**.

## Using the token for source control (private repositories)

To use the GitHub App token to sync a private repository as a project:

1. **Create a Source Control credential** (Credential Type: **Source Control**):
   - **Username**: `x-access-token`
   - **Password**: Click the **link** (key) icon, select **GitHub App Installation Access Token Lookup** as the input source, choose the lookup credential you created above, and click **Next**. Enter an optional description and click **Finish**.
   - Click **Save**.

2. **Create or edit a Project**:
   - **Source Control Type**: Git
   - **Source Control URL**: The HTTPS URL of your private repository (e.g. `https://github.com/your-org/your-repo.git`)
   - **Source Control Credential**: Select the Source Control credential you created in step 1.
   - Click **Save**. The project sync will start automatically.

## How it works

When the project syncs (or any job that uses the linked credential runs), Ascender will:

1. Use the App ID and private RSA key to create a signed JWT.
2. Exchange the JWT for a short-lived installation access token scoped to the installed organization/repositories.
3. Inject the token as the password for the `x-access-token` user, which GitHub accepts for HTTPS Git operations.

The token is generated on-demand and is short-lived (typically valid for 1 hour), making it more secure than long-lived personal access tokens.

## Troubleshooting

- **Project sync fails immediately**: Verify that the GitHub API endpoint URL is correct. For public GitHub, ensure it is set to `https://api.github.com`. If left blank, try re-entering the URL explicitly.
- **401 or authentication errors**: Double-check the App ID, Installation ID, and that the private key matches the one registered with the GitHub App.
- **App not installed error**: Ensure the GitHub App is installed on the organization or repository you are trying to access. The Installation ID must match the installation that has access to the target repository.
- **Permission errors**: Verify the GitHub App has **Contents: Read** permission on the target repository.

## References

- [GitHub: Generating an installation access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
- [GitHub: Managing private keys for GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps)
- [Red Hat: Configuring a GitHub App Installation Access Token Lookup](https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.6/html-single/configuring_automation_execution/index#controller-github-app-token)
