# GitHub App Installation Access Token Lookup

## Overview

The **GitHub App Installation Access Token Lookup** credential type lets
Ascender authenticate with GitHub as a GitHub App instead of with a personal
access token or a deploy key. It is the recommended way to reach private
GitHub repositories for source control, since GitHub App tokens are scoped,
short-lived and auditable.

It is one of the [credential plugins](credential_plugins.md): the credential
holds the App's identity and private key, and a field of another credential
(the password of a Source Control credential) is linked to it. The lookup is
`githubAppBackend` in `src/internal/credplugins/github.go`.

## Prerequisites

1. **A GitHub App** created by your GitHub organization admin.
   - See [Creating GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps).
2. **The App installed** on the target organization or repository.
   - See [Installing GitHub Apps](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app).
3. The following information from your GitHub admin:
   - **App ID** (or Client ID), found on `https://github.com/settings/apps/<app-name>`
   - **Installation ID**, the number at the end of the installation URL, e.g.
     `https://github.com/settings/installations/12345678`
   - **Private RSA key**, the PEM file generated for the App

## Setting up the lookup credential

1. Navigate to **Resources > Credentials** and click **Add**.
2. Select **GitHub App Installation Access Token Lookup** as the **Credential Type**.
3. Fill in the following fields:

   | Field | Description |
   |-------|-------------|
   | **GitHub API endpoint URL** (`github_api_url`) | The GitHub API URL: `https://api.github.com` (the default, also used when the field is empty) for github.com, `https://gh.example.com/api/v3` for a self-hosted GitHub Enterprise Server, or `https://api.SUBDOMAIN.ghe.com` for GitHub Enterprise Cloud. |
   | **GitHub App ID or Client ID** (`app_or_client_id`) | The App ID (e.g. `123456`) or Client ID (e.g. `Iv23liEXAMPLE00000000`) from your GitHub App settings. |
   | **GitHub App Installation ID** (`install_id`) | The Installation ID (e.g. `12345678`) from the installation link. |
   | **RSA Private Key** (`private_rsa_key`) | The full contents of the PEM file provided by the GitHub admin, an RSA key in PKCS#1 (`BEGIN RSA PRIVATE KEY`) or PKCS#8 (`BEGIN PRIVATE KEY`) form. |

4. Click **Save**.

## Using the token for source control (private repositories)

To use the GitHub App token to sync a private repository as a project:

1. **Create a Source Control credential** (Credential Type: **Source Control**):
   - **Username**: `x-access-token`
   - **Password**: Click the **key** icon next to the field, select the
     GitHub App lookup credential you created above, and click **Next**. Enter
     an optional description and click **OK** (or **Test** first, to try the
     lookup).
   - Click **Save**.

2. **Create or edit a Project**:
   - **Source Control Type**: Git
   - **Source Control URL**: The HTTPS URL of your private repository (e.g. `https://github.com/example-org/example-repo.git`)
   - **Source Control Credential**: Select the Source Control credential you created in step 1.
   - Click **Save**. The project sync starts automatically.

Through the API, step 1 is an input source on the Source Control credential,
with only the optional `description` as metadata:

```
POST /api/v2/credentials/<source control credential id>/input_sources/

{
    "source_credential": <github app lookup credential id>,
    "input_field_name": "password",
    "metadata": {}
}
```

## How it works

Each time a project sync (or anything else that uses the linked credential)
starts, Ascender:

1. Signs a JWT with the App's private key, with the App or Client ID as its
   issuer, dated a minute in the past and expiring five minutes from now.
2. Exchanges it for an installation access token at
   `<GitHub API endpoint URL>/app/installations/<installation ID>/access_tokens`.
   The token is scoped to what the installation can reach.
3. Uses the token as the password for the `x-access-token` user, which GitHub
   accepts for HTTPS Git operations.

The token is never stored: a new one is made for each sync, and GitHub lets it
expire after an hour, so it is safer than a long-lived personal access token.

## Troubleshooting

The **Test** button, on the lookup credential's form or in the dialog that
links the password to it, only reports the kind of error. A failed project sync shows the
full message in its traceback, for example:

```
ValueError: Failed to retrieve a GitHub installation token from https://api.github.com using app_or_client_id: 123456, install_id: 12345678. Is the app installed? ...
```

- **`Failed to retrieve a GitHub installation token ... Is the app installed?`**
  (`ValueError`): GitHub answered 404. Make sure the App is installed on the
  organization or repository, and that the Installation ID is the one of that
  installation. A wrong API endpoint URL can also give a 404.
- **`An unexpected error happened while talking to GitHub API ... Is the app or
  client ID correct? And the private RSA key?`** (`RuntimeError`): GitHub
  refused the JWT (usually 401). Check the App or Client ID, and that the
  private key belongs to that App and has not been revoked. GitHub's own
  message follows, after the status code.
- **`Could not deserialize key data ...`** (`ValueError`): the private key is
  not an unencrypted RSA key in PEM form. Paste the whole PEM file, including
  its `BEGIN` and `END` lines.
- **`private_key must not be empty`**: the private key is missing.
- **Clone or fetch is refused**: verify the GitHub App has **Contents: Read**
  permission on the target repository, and that the Source Control
  credential's username is `x-access-token`.

## References

- [GitHub: Generating an installation access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
- [GitHub: Managing private keys for GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps)
