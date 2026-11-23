---
title: Webhooks
description: Set up GitHub, GitLab, and Bitbucket Data Center webhooks that launch Ascender job templates, workflows, and project syncs, and post job status back to the repository.
weight: 70
---

A [webhook](../glossary#webhook) provides the ability to execute specified commands between apps over the web. Ascender currently provides webhook integration with GitHub, GitLab, and Bitbucket Data Center. This section describes the procedure for setting up a webhook through their respective services.

The webhook post-status-back functionality is designed to work only under certain events, which each service's section below lists. When a job with a webhook credential was triggered by another kind of event, no status is posted back, and the service log records the following message at debug level:

```text
Webhook event did not have a status API endpoint associated, skipping.
```

## GitHub webhook setup

Ascender has the ability to run jobs based on a triggered webhook event coming in. Job status information (pending, error, success) can be sent back only for pull request events. If you determine you do not want Ascender to post job statuses back to the webhook service, skip steps 1-2, and go directly to step 3.

1. Optionally generate a personal access token (PAT) for use with Ascender.

   1. In the profile settings of your GitHub account, click **Settings**.
   2. At the very bottom of the settings, click **Developer Settings**.
   3. In the Developer settings, click **Personal access tokens**.
   4. From the Personal access tokens screen, click **Generate new token**.
   5. When prompted, enter your GitHub account password to continue.
   6. In the **Note** field, enter a brief description about what this PAT will be used for.
   7. In the Scope fields, the automation webhook only needs repo scope access, with the exception of invites. For information about other scopes, click the link right above the table to access the docs.

      ![GitHub personal access token scopes, with the link to more information on scopes above the table](/assets/images/webhooks-create-webhook-github-scope.webp)

   8. Click the **Generate Token** button.
   9. Once the token is generated, make sure you copy the PAT, as it will be used in a later step. You will not be able to access this token again in GitHub.

2. Use the PAT to optionally create a GitHub credential:

   1. Go to your instance, and [create a new credential for the GitHub PAT](../credentials#github-personal-access-token) using the above generated token.
   2. Make note of the name of this credential, as it will be used in the job template that posts back to GitHub.

      ![Ascender credential form with the generated PAT entered in the Token field](/assets/images/webhooks-create-credential-github-pat-token.webp)

   3. Go to the job template with which you want to enable webhooks, and select the webhook service and credential you created in the previous step.

      ![Job template form with the GitHub webhook service and webhook credential selected](/assets/images/webhooks-job-template-gh-webhook-credential.webp)

   4. Click **Save**. Now your job template is set up to be able to post back to GitHub. An example of one may look like this:

      ![An example GitHub status that shows all checks have passed](/assets/images/webhooks-ascender-to-github-status.webp)

3. Go to a specific GitHub repo you want to configure webhooks and click **Settings**.

   ![Settings link in a GitHub repository](/assets/images/webhooks-github-repo-settings.webp)

4. Under Options, click **Webhooks**.

   ![Webhooks link under Options in the GitHub repository settings](/assets/images/webhooks-github-repo-settings-options.webp)

5. On the Webhooks page, click **Add webhook**.
6. To complete the Add Webhook page, you need to [enable webhooks in a job template](../job-templates#create-a-job-template) (or in a [workflow job template](../workflow-templates#create-a-workflow-template)), which will provide you with the following information:

   1. Copy the contents of the **Webhook URL** from the job template, and paste it in the **Payload URL** field. GitHub uses this address to send results to.
   2. Set the **Content type** to **application/json**.
   3. Copy the contents of the **Webhook Key** from the job template above and paste it in the **Secret** field.
   4. Leave **Enable SSL verification** selected.

      ![GitHub Add webhook page with the payload URL, content type, and secret filled in](/assets/images/webhooks-github-repo-add-webhook.webp)

   5. Next, you must select the types of events you want to trigger a webhook. Any such event will trigger the Job or Workflow. In order to have job status (pending, error, success) sent back to GitHub, you must select **Pull requests** in the individual events section.

      ![List of individual trigger events for the GitHub webhook, with Pull requests selected](/assets/images/webhooks-github-repo-choose-events.webp)

   6. Leave **Active** checked and click **Add Webhook**.

      ![Active option and Add webhook button at the bottom of the GitHub form](/assets/images/webhooks-github-repo-add-webhook-actve.webp)

7. After your webhook is configured, it displays in the list of webhooks active for your repo, along with the ability to edit or delete it. Click on a webhook, and it brings you to the Manage webhook screen. Scroll to the very bottom of the screen to view all the delivery attempts made to your webhook and whether they succeeded or failed.

   ![An example listing of recent webhook deliveries in GitHub](/assets/images/webhooks-github-repo-webhooks-deliveries.webp)

For more information, refer to the [GitHub Webhooks developer documentation](https://developer.github.com/webhooks/).

## GitLab webhook setup

Ascender has the ability to run jobs based on a triggered webhook event coming in. Job status information (pending, error, success) can be sent back for push, tag push, and merge request events. If you determine you do not want Ascender to post job statuses back to the webhook service, skip steps 1-2, and go directly to step 3.

1. Optionally, generate a personal access token (PAT). This token gives Ascender the ability to post statuses back when we run jobs based on a webhook coming in.

   1. In the profile settings of your GitLab account, click **Settings**.
   2. On the sidebar, under User Settings, click **Access Tokens**.

      ![Access Tokens link under User Settings in GitLab](/assets/images/webhooks-create-webhook-gitlab-settings.webp)

   3. In the **Name** field, enter a brief description about what this PAT will be used for.
   4. Skip the **Expires at** field unless you want to set an expiration date for your webhook.
   5. In the Scopes fields, select the ones applicable to your integration. For Ascender, API is the only selection necessary.

      ![GitLab Personal Access Tokens page with the api scope selected](/assets/images/webhooks-create-webhook-gitlab-scope.webp)

   6. Click the **Create personal access token** button.
   7. Once the token is generated, make sure you copy the PAT, as it will be used in a later step. You will not be able to access this token again in GitLab.

2. Use the PAT to optionally create a GitLab credential:

   1. Go to your instance, and [create a new credential for the GitLab PAT](../credentials#gitlab-personal-access-token) using the above generated token.
   2. Make note of the name of this credential, as it will be used in the job template that posts back to GitLab.

      ![Ascender Create New Credential page for a GitLab personal access token](/assets/images/webhooks-create-credential-gitlab-pat-token.webp)

   3. Go to the job template with which you want to enable webhooks, and select the webhook service and credential you created in the previous step.

      ![Job template form with the GitLab webhook service and webhook credential selected](/assets/images/webhooks-job-template-gl-webhook-credential.webp)

   4. Click **Save**. Now your job template is set up to be able to post back to GitLab. An example of one may look like this:

      ![An example GitLab pipeline status message posted by Ascender](/assets/images/webhooks-ascender-to-gitlab-status.webp)

3. Go to a specific GitLab repo you want to configure webhooks and click **Settings > Integrations**.

   ![Integrations link under Settings in a GitLab repository](/assets/images/webhooks-gitlab-repo-settings.webp)

4. To complete the Integrations page, you need to [enable webhooks in a job template](../job-templates#create-a-job-template) (or in a [workflow job template](../workflow-templates#create-a-workflow-template)), which will provide you with the following information:

   1. Copy the contents of the **Webhook URL** from the job template above, and paste it in the **URL** field. GitLab uses this address to send results to.
   2. Copy the contents of the **Webhook Key** from the job template above and paste it in the **Secret Token** field.
   3. Next, you must select the types of events you want to trigger a webhook. Any such event will trigger the Job or Workflow. Job status (pending, error, success) is sent back to GitLab for **Push events**, **Tag push events**, and **Merge request events**.
   4. Leave **Enable SSL verification** selected.
   5. Click **Add webhook**.

   ![GitLab Integrations page with the webhook URL, secret token, and trigger events](/assets/images/webhooks-gitlab-repo-add-webhook.webp)

5. After your webhook is configured, it displays in the list of Project Webhooks for your repo, along with the ability to test events, edit or delete the webhook. Testing a webhook event displays the results at the top of the page whether it succeeded or failed.

For more information, refer to the [GitLab webhooks integrations documentation](https://docs.gitlab.com/ee/user/project/integrations/webhooks.html).

## Bitbucket Data Center webhook setup

Ascender can run jobs when a Bitbucket Data Center repository sends a webhook. It accepts repository push, mirror synchronization, and pull request opened, source branch updated, and modified events, and acknowledges and ignores any other event. Job status information (in progress, successful, failed) is posted back to the commit through the Bitbucket build status API for those events. If you determine you do not want Ascender to post job statuses back to Bitbucket, skip steps 1-2, and go directly to step 3.

1. Optionally, create an HTTP access token in your Bitbucket user settings, and copy it, as it will be used in the next step.
2. Use the token to optionally create a Bitbucket Data Center credential:

   1. Go to your instance, and [create a new credential for the Bitbucket Data Center HTTP access token](../credentials#bitbucket-data-center-http-access-token).
   2. Go to the job template with which you want to enable webhooks, select **Bitbucket Data Center** as the webhook service, and select the credential you created as the webhook credential.
   3. Click **Save**.

3. To complete the repository's webhook, you need to [enable webhooks in a job template](../job-templates#create-a-job-template) (or in a [workflow job template](../workflow-templates#create-a-workflow-template)), which will provide you with the following information:

   1. In the repository settings in Bitbucket, open **Webhooks** and create a webhook.
   2. Copy the contents of the **Webhook URL** from the job template, and paste it in the **URL** field.
   3. Copy the contents of the **Webhook Key** from the job template and paste it in the **Secret** field. Bitbucket signs each request with it, and Ascender rejects requests whose signature does not match.
   4. Select the events that should trigger the job template, such as the repository push event or the pull request events, and save the webhook.

## Payload output

The entire payload is exposed as an extra variable. To view the payload information, go to the Jobs Detail view of the job template that ran with the webhook enabled. In the **Extra Variables** field of the Details pane, view the payload output from the `awx_webhook_payload` variable, as shown in the example below.

![Job Details pane showing the webhook payload in the Extra Variables field](/assets/images/webhooks-jobs-extra-vars-payload.webp)

![Expanded view of the Extra Variables field with the awx_webhook_payload contents](/assets/images/webhooks-jobs-extra-vars-payload-expanded.webp)

## Project webhooks

Projects can also be updated by a webhook, so a push to the repository immediately syncs the project instead of relying on scheduled updates or on **Update Revision on Launch** (which delays every job launch by a project update).

To enable it, edit the project, check **Enable Webhook** in the options of the source control type, and pick the webhook service (GitHub, GitLab or Bitbucket Data Center). Saving the project generates the **Webhook URL** and **Webhook Key**; configure them in the repository the same way as for a job template (see the sections above), selecting only push events. There is no webhook credential for projects, since a project sync has no status to post back.

Instead of letting a new key be generated, you can also type your own secret in the **Webhook Key** field (or pass `webhook_key` through the API). This is convenient when the key is managed as configuration, for example stored in a vault and applied both to the repository and to the project by an automation. This works the same way for job templates and workflow job templates. Changing the webhook service, or saving with the **Webhook Key** field empty, generates a new key unless you type one; turning the webhook off removes the key.

Only push and tag push events trigger a sync; any other event is acknowledged and ignored. The sync behaves exactly like the **Sync** button and fetches the branch or refspec configured in the project. If you only care about some refs, set a **Webhook Ref Filter** pattern, for example `refs/heads/main` or `refs/heads/release-*`; pushes to refs that do not match the pattern are ignored. When the filter is empty, any push triggers a sync.

Project updates started by a webhook show `webhook` as their launch type, along with the service and the event id that triggered them.
