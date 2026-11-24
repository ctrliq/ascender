---
title: Credentials
description: Create and manage Ascender credentials for machines, source control, cloud providers, container registries, vaults, and other systems.
weight: 20
---

Credentials are utilized for authentication when launching Jobs against machines, synchronizing with inventory sources, and importing project content from a version control system.

You can grant users and teams the ability to use these credentials, without actually exposing the credential to the user. If you have a user move to a different team or leave the organization, you don't have to re-key all of your systems just because that credential was available in Ascender.

<Hint type="note">

Ascender encrypts passwords and key information in the database and never makes secret information visible via the API. See [Secret Handling](/admin-guide/secret-handling) in the [Ascender Administration Guide](/admin-guide) for details.

</Hint>

## Understanding How Credentials Work

Ascender uses SSH to connect to remote hosts (or the Windows equivalent). In order to pass the key from Ascender to SSH, the key must be decrypted before it can be written to a named pipe. Ascender then uses that pipe to send the key to SSH (so that it is never written to disk).

If passwords are used, Ascender handles those by responding directly to the password prompt and decrypting the password before writing it to the prompt.

## Getting Started with Credentials

Click **Credentials** from the left navigation bar to access the Credentials page. The Credentials page displays a searchable list of all available Credentials and can be sorted by **Name**.

![Credentials list view with example credentials](/assets/images/credentials-demo-edit-details.webp)

Credentials added to a Team are made available to all members of the Team, whereas credentials added to a User are only available to that specific User by default.

Clicking the name of a credential in the list takes you to the **Details** view of that credential.

![Details tab of a credential](/assets/images/credentials-home-with-demo-credential-details.webp)

Clicking the **Access** tab shows you users and teams associated with this Credential and their granted roles (owner, admin, auditor, etc.)

![Access tab for a credential containing two users with their roles](/assets/images/credentials-home-with-permissions-detail.webp)

<Hint type="note">

A credential with roles associated will retain them even after the credential has been reassigned to another organization.

</Hint>

You can click the **Add** button to assign this credential to additional users. If no users exist, add them from the **Users** menu and refer to the [Users](../users) section for further detail.

Clicking the **Job Templates** tab shows you the job templates associated with this Credential and which jobs recently ran using this particular credential.

![Job Templates tab for a credential with an example job template](/assets/images/credentials-home-with-jt-detail.webp)

You can click the **Add** button to assign this credential to additional job templates. Refer to the [Job Templates](../job-templates) section for further detail on creating a new job template.

## Add a New Credential

To create a new credential:

1. Click the **Add** button from the **Credentials** screen.

   ![Create New Credential form](/assets/images/credentials-create-credential.webp)

2. Enter the name for your new credential in the **Name** field.
3. Optionally enter a description and enter or select the name of the organization with which the credential is associated.
4. Enter or select the credential type you want to create.

   ![Credential Type drop-down menu listing the available credential types](/assets/images/credential-types-drop-down-menu.webp)

5. Enter the appropriate details depending on the type of credential selected, as described in the next section, [Credential Types](#credential-types).
6. Click **Save** when done.

<Hint type="note">

A credential with a set of permissions associated with one organization will remain even after the credential is reassigned to another organization.

</Hint>

## Credential Types

The following credential types are supported with Ascender.

The credential types associated with AWS Secrets Manager, Centrify, CyberArk, GitHub App, HashiCorp Vault, Microsoft Azure Key Management System (KMS), and Thycotic are part of the credential plugins capability that allows an external system to look up your secrets information. See the [Secret Management System](../secret-management) section for further detail.

### Amazon Web Services

Selecting this credential type enables synchronization of cloud inventory with Amazon Web Services.

Ascender uses the following environment variables for AWS credentials and are fields prompted in the user interface:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_SECURITY_TOKEN
```

![Create New Credential form for an Amazon Web Services credential](/assets/images/credentials-create-aws-credential.webp)

Traditional Amazon Web Services credentials consist of the AWS **Access Key** and **Secret Key**.

Ascender provides support for EC2 STS tokens (sometimes referred to as IAM STS credentials). Security Token Service (STS) is a web service that enables you to request temporary, limited-privilege credentials for AWS Identity and Access Management (IAM) users. To learn more about the IAM/EC2 STS Token, refer to the [AWS documentation on temporary security credentials](http://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp.html).

<Hint type="note">

If the value of your tags in EC2 contain booleans (yes/no/true/false), you must remember to quote them.

</Hint>

<Hint type="warning">

To use implicit IAM role credentials, do not attach AWS cloud credentials in Ascender when relying on IAM roles to access the AWS API. While it may seem to make sense to attach your AWS cloud credential to your job template, doing so will force the use of your AWS credentials and will not "fall through" to use your IAM role credentials (this is due to the use of the boto library.)

</Hint>

### AWS Secrets Manager

This is considered part of the secret management capability. See [AWS Secrets Manager Lookup](../secret-management#aws-secrets-manager-lookup) for more detail.

### Ansible Galaxy/Automation Hub API Token

Selecting this credential allows Ascender to access Galaxy or use a collection published on a private automation hub. See [Collections Support](../projects#collections-support) for detail. Entering the Galaxy server URL is the only required value on this screen.

![Create New Credential form for an Ansible Galaxy/Automation Hub API Token credential](/assets/images/credentials-create-galaxy-credential.webp)

### Bitbucket Data Center HTTP Access Token

Selecting this credential allows you to access Bitbucket Data Center using an HTTP access token, which you create in your user settings in Bitbucket. Entering the token is the only required value on this screen.

Bitbucket Data Center HTTP access token credentials have the following input:

- **Token** (required): The HTTP access token from your Bitbucket user settings.

This credential is used as the webhook credential on job templates and workflow job templates that use Bitbucket Data Center as their webhook service. When a job triggered by a Bitbucket Data Center webhook changes state, Ascender uses the token to post the job's build status (in progress, successful, or failed) back to the commit in Bitbucket. See [Webhooks](../webhooks) for detail.

### Centrify Vault Credential Provider Lookup

This is considered part of the secret management capability. See [Centrify Vault Credential Provider Lookup](../secret-management#centrify-vault-credential-provider-lookup) for more detail.

### CIQ Ascender Automation Platform

Selecting this credential allows you to access another Ascender instance.

![Create New Credential form showing the platform URL, username, password, OAuth token, and Verify SSL fields](/assets/images/credentials-create-at-credential.webp)

The CIQ Ascender Automation Platform credentials have the following inputs:

- **CIQ Ascender Automation Platform** (required): The base URL or IP address of the other instance to connect to.
- **Username**: The username to use to connect to it.
- **Password**: The password to use to connect to it.
- **OAuth Token**: If username and password is not used, provide an OAuth token to use to authenticate.

### CIQ Depot

Selecting this credential allows playbooks to authenticate to [CIQ Depot](https://docs.ciq.com/depot), CIQ's package repository and software distribution platform. Create or look up your Depot username and token in the [CIQ Portal](https://portal.ciq.com/manage/token).

CIQ Depot credentials have the following inputs, all of which are required:

- **CIQ Depot Server**: The Depot server to connect to. Defaults to `depot.ciq.com`.
- **CIQ Depot User**: Your Depot username.
- **CIQ Depot Token**: Your Depot token.

When this credential is attached to a job template, Ascender injects the values into the job's environment as `DEPOT_SERVER`, `DEPOT_USER`, and `DEPOT_TOKEN`. Playbooks can read them with the `env` lookup, for example `{{ lookup('env', 'DEPOT_TOKEN') }}`, so the token never needs to be stored in your playbooks or inventory.

### Container Registry

Selecting this credential allows Ascender to access a collection of container images. See [What is a container registry?](https://www.redhat.com/en/topics/cloud-native-apps/what-is-a-container-registry) for more information.

Aside from specifying a name, the **Authentication URL** is the only required field on this screen, and it is already pre-populated with a default value. You may change this default by specifying the authentication endpoint for a different container registry.

![Create New Credential form for a Container Registry credential](/assets/images/credentials-create-container-credential.webp)

### CyberArk Central Credential Provider Lookup

This is considered part of the secret management capability. See [CyberArk Central Credential Provider (CCP) Lookup](../secret-management#cyberark-central-credential-provider-ccp-lookup) for more detail.

### CyberArk Conjur Secrets Manager Lookup

This is considered part of the secret management capability. See [CyberArk Conjur Secrets Manager Lookup](../secret-management#cyberark-conjur-secrets-manager-lookup) for more detail.

### GitHub App Installation Access Token Lookup

This is considered part of the secret management capability. See [GitHub App Installation Access Token Lookup](../secret-management#github-app-installation-access-token-lookup) for more detail.

### GitHub Personal Access Token

Selecting this credential allows you to access GitHub using a Personal Access Token (PAT), which is obtained through GitHub. See [Webhooks](../webhooks) for detail. Entering the provided token is the only required value in this screen.

![Create New Credential form for a GitHub Personal Access Token credential](/assets/images/credentials-create-webhook-github-credential.webp)

GitHub PAT credentials require a value in the **Token** field, which is provided in your GitHub profile settings.

This credential can be used for establishing an API connection to GitHub for use in webhook listener jobs, to post status updates.

### GitLab Personal Access Token

Selecting this credential allows you to access GitLab using a Personal Access Token (PAT), which is obtained through GitLab. See [Webhooks](../webhooks) for detail. Entering the provided token is the only required value in this screen.

![Create New Credential form for a GitLab Personal Access Token credential](/assets/images/credentials-create-webhook-gitlab-credential.webp)

GitLab PAT credentials require a value in the **Token** field, which is provided in your GitLab profile settings.

This credential can be used for establishing an API connection to GitLab for use in webhook listener jobs, to post status updates.

### Google Compute Engine

Selecting this credential type enables synchronization of cloud inventory with Google Compute Engine (GCE).

Ascender uses the following environment variables for GCE credentials and are fields prompted in the user interface:

```text
GCE_EMAIL
GCE_PROJECT
GCE_CREDENTIALS_FILE_PATH
```

![Create New Credential form for a Google Compute Engine credential](/assets/images/credentials-create-gce-credential.webp)

GCE credentials have the following inputs that are required:

- **Service Account Email Address**: The email address assigned to the Google Compute Engine **service account**.
- **Project**: Optionally provide the GCE assigned identification or the unique project ID you provided at project creation time.
- **Service Account JSON File**: Optionally upload a GCE service account file. Use the **Browse** (folder) icon to browse for the file that contains the special account information that can be used by services and applications running on your GCE instance to interact with other Google Cloud Platform APIs. This grants permissions to the service account and virtual machine instances.
- **RSA Private Key**: The PEM file associated with the service account email.

### GPG Public Key

Selecting this credential type allows you to create a credential that gives Ascender the ability to verify the integrity of the project when syncing from source control.

![Create New Credential form for a GPG Public Key credential](/assets/images/credentials-create-gpg-credential.webp)

See [Project Signing and Verification](../project-signing) for detailed information on how to generate a valid keypair, use the CLI tool to sign content, and how to add the public key to Ascender.

### HashiCorp Vault Secret Lookup

This is considered part of the secret management capability. See [HashiCorp Vault Secret Lookup](../secret-management#hashicorp-vault-secret-lookup) for more detail.

### HashiCorp Vault Signed SSH

This is considered part of the secret management capability. See [HashiCorp Vault Signed SSH](../secret-management#hashicorp-vault-signed-ssh) for more detail.

### HashiCorp Vault Secret Lookup (OIDC)

This is considered part of the secret management capability. It logs in to Vault as the job, with no stored secret. See [HashiCorp Vault Secret Lookup (OIDC)](../secret-management#hashicorp-vault-secret-lookup-oidc) for more detail.

### HashiCorp Vault Signed SSH (OIDC)

This is considered part of the secret management capability. It logs in to Vault as the job, with no stored secret. See [HashiCorp Vault Signed SSH (OIDC)](../secret-management#hashicorp-vault-signed-ssh-oidc) for more detail.

### Machine

Machine credentials enable Ascender to invoke Ansible on hosts under your management. Just like using Ansible on the command line, you can specify the SSH username, optionally provide a password, an SSH key, a key password, or even have Ascender prompt the user for their password at deployment time. They define ssh and user-level privilege escalation access for playbooks, and are used when submitting jobs to run playbooks on a remote host. Network connections (`httpapi`, `netconf`, and `network_cli`) use **Machine** for the credential type.

Machine/SSH credentials do not use environment variables. Instead, they pass the username via the `ansible -u` flag, and interactively write the SSH password when the underlying SSH client prompts for it.

![Create New Credential form for a Machine credential](/assets/images/credentials-create-machine-credential.webp)

Machine credentials have several attributes that may be configured:

- **Username**: The username to be used for SSH authentication.
- **Password**: The actual password to be used for SSH authentication. This password will be stored encrypted in the database, if entered. Alternatively, you can configure Ascender to ask the user for the password at launch time by selecting **Prompt on launch**. In these cases, a dialog opens when the job is launched, prompting the user to enter the password.
- **SSH Private Key**: Copy or drag-and-drop the SSH private key for the machine credential.
- **Private Key Passphrase**: If the SSH Private Key used is protected by a password, you can configure a Key Password for the private key. This password will be stored encrypted in the database, if entered. Alternatively, you can configure Ascender to ask the user for the password at launch time by selecting **Prompt on launch**. In these cases, a dialog opens when the job is launched, prompting the user to enter the password.
- **Privilege Escalation Method**: Specifies the type of escalation privilege to assign to specific users. This is equivalent to specifying the `--become-method=BECOME_METHOD` parameter, where `BECOME_METHOD` could be any of the typical methods described below, or a custom method you've written. Begin entering the name of the method, and the appropriate name auto-populates.

![Privilege Escalation Method drop-down menu on the Machine credential form](/assets/images/credentials-create-machine-credential-priv-escalation.webp)

- empty selection: If a task/play has `become` set to `yes` and is used with an empty selection, then it will default to `sudo`
- **sudo**: Performs single commands with super user (root user) privileges
- **su**: Switches to the super user (root user) account (or to other user accounts)
- **pbrun**: Requests that an application or command be run in a controlled account and provides for advanced root privilege delegation and keylogging
- **pfexec**: Executes commands with predefined process attributes, such as specific user or group IDs
- **dzdo**: An enhanced version of sudo that uses RBAC information in Centrify's Active Directory service (see Centrify's [site on DZDO](http://community.centrify.com/t5/Centrify-Server-Suite/FAQ-What-is-DirectAuthorize-dzdo-dzwin/td-p/21193))
- **pmrun**: Requests that an application is run in a controlled account (refer to [Privilege Manager for Unix 6.0](http://documents.software.dell.com/privilege-manager-for-unix/6.0/administrators-guide/privilege-manager-programs/pmrun))
- **runas**: Allows you to run as the current user
- **enable**: Switches to elevated permissions on a network device
- **doas**: Allows your remote/login user to execute commands as another user via the doas ("Do as user") utility
- **ksu**: Allows your remote/login user to execute commands as another user via Kerberos access
- **machinectl**: Allows you to manage containers via the systemd machine manager
- **sesu**: Allows your remote/login user to execute commands as another user via the CA Privileged Access Manager

<Hint type="note">

Custom `become` plugins are available only starting with Ansible 2.8. For more detail on this concept, refer to [Understanding Privilege Escalation](https://docs.ansible.com/ansible/latest/user_guide/become.html) and the [list of become plugins](https://docs.ansible.com/ansible/latest/plugins/become.html#plugin-list).

</Hint>

- **Privilege Escalation Username**: Enter the username to use with escalation privileges on the remote system.
- **Privilege Escalation Password**: Enter the actual password to be used to authenticate the user via the selected privilege escalation type on the remote system. This password will be stored encrypted in the database, if entered. Alternatively, you may configure Ascender to ask the user for the password at launch time by selecting **Prompt on launch**. In these cases, a dialog opens when the job is launched, prompting the user to enter the password.

<Hint type="note">

Sudo Password must be used in combination with SSH passwords or SSH Private Keys, since Ascender must first establish an authenticated SSH connection with the host prior to invoking sudo to change to the sudo user.

</Hint>

<Hint type="warning">

Credentials which are used in *Scheduled Jobs* must not be configured as "**Prompt on launch**".

</Hint>

### Microsoft Azure Key Vault

This is considered part of the secret management capability. See [Microsoft Azure Key Vault](../secret-management#microsoft-azure-key-vault) for more detail.

### Microsoft Azure Resource Manager

Selecting this credential type enables synchronization of cloud inventory with Microsoft Azure Resource Manager.

![Create New Credential form for a Microsoft Azure Resource Manager credential](/assets/images/credentials-create-azure-credential.webp)

Microsoft Azure Resource Manager credentials have several attributes that may be configured:

- **Subscription ID**: The Subscription UUID for the Microsoft Azure account (required).
- **Username**: The username to use to connect to the Microsoft Azure account.
- **Password**: The password to use to connect to the Microsoft Azure account.
- **Client ID**: The Client ID for the Microsoft Azure account.
- **Client Secret**: The Client Secret for the Microsoft Azure account.
- **Tenant ID**: The Tenant ID for the Microsoft Azure account.
- **Azure Cloud Environment**: The variable associated with Azure cloud or Azure stack environments.

These fields are equivalent to the variables in the API. To pass service principal credentials, define the following variables:

```text
AZURE_CLIENT_ID
AZURE_SECRET
AZURE_SUBSCRIPTION_ID
AZURE_TENANT
AZURE_CLOUD_ENVIRONMENT
```

To pass an Active Directory username/password pair, define the following variables:

```text
AZURE_AD_USER
AZURE_PASSWORD
AZURE_SUBSCRIPTION_ID
```

You can also pass credentials as parameters to a task within a playbook. The order of precedence is parameters, then environment variables, and finally a file found in your home directory.

To pass credentials as parameters to a task, use the following parameters for service principal credentials:

```text
client_id
secret
subscription_id
tenant
azure_cloud_environment
```

Or, pass the following parameters for Active Directory username/password:

```text
ad_user
password
subscription_id
```

### NetBox

Selecting this credential type enables synchronization of cloud inventory with [NetBox](https://netbox.dev). NetBox credentials have the following inputs:

- **NetBox URL** (required): The URL of the NetBox server, for example `https://netbox.example.org`. It must be reachable from where the inventory update runs, the execution node or container group, not from your browser.
- **API Token**: A NetBox API token with read access to the devices, virtual machines and other objects the inventory reads. Both the older 40-character tokens and the `nbt_` tokens of NetBox 4.5 and later work.
- **Verify SSL**: Whether to check the NetBox server's certificate. On by default.

When an inventory source syncs from NetBox, and when a job template uses the credential, Ascender passes it in the following environment variables, which the `netbox.netbox` collection's inventory plugin and lookup read:

```text
NETBOX_API
NETBOX_TOKEN
```

For an inventory source, **Verify SSL** is given to the inventory plugin as its `validate_certs` option. For more information, refer to [NetBox](../inventories#netbox) in the inventories section.

### Network

Select the Network credential type **only** if you are using a `local` connection with `provider` to use Ansible networking modules to connect to and manage networking devices. When connecting to network devices, the credential type must match the connection type:

- For `local` connections using `provider`, credential type should be **Network**
- For all other network connections (`httpapi`, `netconf`, and `network_cli`), credential type should be **Machine**

For an overview of connection types available for network devices, refer to [Multiple Communication Protocols](https://docs.ansible.com/ansible/devel/network/getting_started/network_differences.html#multiple-communication-protocols).

Ascender uses the following environment variables for Network credentials and are fields prompted in the user interface:

```text
ANSIBLE_NET_USERNAME
ANSIBLE_NET_PASSWORD
```

![Create New Credential form for a Network credential](/assets/images/credentials-create-network-credential.webp)

Network credentials have several attributes that may be configured:

- **Username**: The username to use in conjunction with the network device (required).
- **Password**: The password to use in conjunction with the network device.
- **SSH Private Key**: Copy or drag-and-drop the actual SSH Private Key to be used to authenticate the user to the network via SSH.
- **Private Key Passphrase**: The actual passphrase for the private key to be used to authenticate the user to the network via SSH.
- **Authorize**: Select this from the Options field to control whether or not to enter privileged mode.
- If **Authorize** is checked, enter a password in the **Authorize Password** field to access privileged mode.

For more information, refer to the *Inside Playbook* blog, [Porting Ansible Network Playbooks with New Connection Plugins](https://www.ansible.com/blog/porting-ansible-network-playbooks-with-new-connection-plugins).

### OIDC Workload Identity Token

Gives the job a short-lived token, signed by Ascender for that job, for the playbook to trade with a system that trusts Ascender as an OIDC issuer: an AWS role through `AssumeRoleWithWebIdentity`, an Azure federated credential, a Google workload identity pool, or the JWT login of Vault from the playbook itself. Workload identity has to be turned on; see [Workload Identity](/admin-guide/workload-identity).

The only attribute is **Audience** (required): who the token is for, as that system expects it in the `aud` claim, for example `sts.amazonaws.com` or `api://AzureADTokenExchange`.

The job finds the token in a file, whose path is in the `ASCENDER_WORKLOAD_IDENTITY_TOKEN_FILE` environment variable. The token itself is deliberately not in the environment, which a play against `localhost` stores with its facts. The file is removed with the rest of the job's private data when it finishes. The token lasts as long as the timeout of the job, at most a day, or the **Workload Identity Token Lifetime** setting when the job has no timeout.

For example, to assume an AWS role with it:

```yaml
- name: Assume the deployment role
  environment:
    AWS_ROLE_ARN: arn:aws:iam::123456789012:role/ascender-deploy
    AWS_WEB_IDENTITY_TOKEN_FILE: "{{ lookup('env', 'ASCENDER_WORKLOAD_IDENTITY_TOKEN_FILE') }}"
  amazon.aws.s3_object_info:
    bucket_name: releases
```

<Hint type="note">

The playbook holds the token and can send it anywhere. Only bind roles to the templates whose project you trust.

</Hint>

### OpenShift or Kubernetes API Bearer Token

Selecting this credential type allows you to create instance groups that point to a Kubernetes or OpenShift container. For more information about this concept, refer to [Container and Instance Groups](/admin-guide/container-instance-groups).

![Create New Credential form for an OpenShift or Kubernetes API Bearer Token credential](/assets/images/credentials-create-containers-credential.webp)

Container credentials have the following inputs:

- **OpenShift or Kubernetes API Endpoint** (required): the endpoint to be used to connect to an OpenShift or Kubernetes container
- **API Authentication Bearer Token** (required): The token to use to authenticate the connection
- **Verify SSL**: Optionally you can check this option to verify the server's SSL certificate is valid and trusted. Environments that use internal or private CAs should leave this option unchecked to disable verification.
- **Certificate Authority Data**: include the `BEGIN CERTIFICATE` and `END CERTIFICATE` lines when pasting the certificate, if provided

A `ContainerGroup` is a type of `InstanceGroup` that has an associated Credential that allows for connecting to an OpenShift cluster. To set up a container group, you must first have the following:

- A namespace you can launch into (every cluster has a "default" namespace, but you may want to use a specific namespace)
- A service account that has the roles that allow it to launch and manage Pods in this namespace
- If you will be using execution environments in a private registry, and have a Container Registry credential associated to them in Ascender, the service account also needs the roles to get, create, and delete secrets in the namespace. If you do not want to give these roles to the service account, you can pre-create the `ImagePullSecrets` and specify them on the pod spec for the ContainerGroup. In this case, the execution environment should NOT have a Container Registry credential associated, or Ascender will attempt to create the secret for you in the namespace.
- A token associated with that service account (OpenShift or Kubernetes Bearer Token)
- A CA certificate associated with the cluster

This section describes creating a Service Account in an OpenShift cluster (or K8s) in order to be used to run jobs in a container group via Ascender. After the Service Account is created, its credentials are provided to Ascender in the form of an OpenShift or Kubernetes API bearer token credential. Below describes how to create a service account and collect the needed information for configuring Ascender.

To configure Ascender:

1. To create a service account, you may download and use this sample service account, [containergroup-sa.yml](https://github.com/ctrliq/ascender/blob/main/docs/docsite/rst/common/containergroup-sa.yml), and modify it as needed to obtain the above credentials.
2. Apply the configuration from `containergroup-sa.yml`:

   ```bash
   oc apply -f containergroup-sa.yml
   ```

3. Get the secret name associated with the service account:

   ```bash
   export SA_SECRET=$(oc get sa containergroup-service-account -o json | jq '.secrets[0].name' | tr -d '"')
   ```

4. Get the token from the secret:

   ```bash
   oc get secret $(echo ${SA_SECRET}) -o json | jq '.data.token' | xargs | base64 --decode > containergroup-sa.token
   ```

5. Get the CA cert:

   ```bash
   oc get secret $SA_SECRET -o json | jq '.data["ca.crt"]' | xargs | base64 --decode > containergroup-ca.crt
   ```

6. Use the contents of `containergroup-sa.token` and `containergroup-ca.crt` to provide the information for the [OpenShift or Kubernetes API Bearer Token](#openshift-or-kubernetes-api-bearer-token) required for the container group.

### OpenStack

Selecting this credential type enables synchronization of cloud inventory with OpenStack.

![Create New Credential form for an OpenStack credential](/assets/images/credentials-create-openstack-credential.webp)

OpenStack credentials support two authentication methods: a username and password (Keystone `password` authentication), or a Keystone application credential (`v3applicationcredential` authentication). Provide one or the other, along with the authentication URL, which is always required.

**Shared field:**

- **Host (Authentication URL)**: The Keystone endpoint to authenticate with. For example, `https://openstack.business.com:5000/v3`. Always required, regardless of authentication method.

**Password authentication fields** (leave these blank when using an application credential):

- **Username**: The username to use to connect to OpenStack.
- **Password (API Key)**: The password to use to connect to OpenStack. Application credentials, including those created in Horizon under Identity → Application Credentials, belong in the Application Credential fields below, not in this field.
- **Project (Tenant Name)**: The project (tenant) to scope the authentication to. Required when using password authentication.
- **Project (Domain Name)**: The domain the project belongs to. Required on multi-domain clouds. On single-domain clouds this can be left blank.
- **Domain Name**: The domain to use for a domain-scoped token. Only needed for domain-level administrative access. Leave blank for inventory use.

**Application credential fields** (leave these blank when using username and password):

- **Application Credential ID**: The ID of a Keystone application credential, created in Horizon under Identity → Application Credentials or with `openstack application credential create`.
- **Application Credential Secret**: The secret issued when the application credential was created. The secret is shown once at creation time and cannot be retrieved afterward.

When both application credential fields are set, they are used instead of the username and password. Application credentials are scoped to a project when they are created and inherit the creating user's roles. Keystone rejects additional project or domain scoping in this mode, so the project and domain fields are ignored.

**Fields that apply to both methods:**

- **Region Name**: The region whose service endpoints should be used, for providers that require it (for example, OVH). Region selection is not part of authentication.
- **Verify SSL**: Whether to validate the TLS certificate of the OpenStack endpoints.

Common scenarios:

- *Username and password*: fill in Host, Username, Password, and Project. Add Project (Domain Name) on clouds with more than one domain.
- *Application credential*: fill in Host, Application Credential ID, and Application Credential Secret only. Application credentials can be revoked and rotated independently of the user's password.
- A credential that provides neither a username/password pair nor an application credential is accepted when saved but fails at job or inventory sync launch time.

If you are interested in using OpenStack Cloud Credentials, refer to [Utilizing Cloud Credentials](../job-templates#utilizing-cloud-credentials) in this guide for more information, including a sample playbook.

### Red Hat Satellite 6

Selecting this credential type enables synchronization of cloud inventory with Red Hat Satellite 6.

When an inventory source syncs from Red Hat Satellite 6, Ascender passes the credential to the `foreman` inventory plugin in the following environment variables:

```text
FOREMAN_SERVER
FOREMAN_USER
FOREMAN_PASSWORD
```

A Satellite 6 credential injects nothing into job templates.

![Create New Credential form for a Red Hat Satellite 6 credential](/assets/images/credentials-create-rh-sat-credential.webp)

Satellite credentials have the following inputs that are required:

- **Satellite 6 URL**: The Satellite 6 URL or IP address to connect to.
- **Username**: The username to use to connect to Satellite 6.
- **Password**: The password to use to connect to Satellite 6.

### Source Control

SCM (source control) credentials are used with Projects to clone and update local source code repositories from a remote revision control system such as Git or Subversion.

![Create New Credential form for a Source Control credential](/assets/images/credentials-create-scm-credential.webp)

Source Control credentials have several attributes that may be configured:

- **Username**: The username to use in conjunction with the source control system.
- **Password**: The password to use in conjunction with the source control system.
- **SCM Private Key**: Copy or drag-and-drop the actual SSH Private Key to be used to authenticate the user to the source control system via SSH.
- **Private Key Passphrase**: If the SSH Private Key used is protected by a passphrase, you may configure a Key Passphrase for the private key.

<Hint type="note">

Source Control credentials cannot be configured as "**Prompt on launch**". If you are using a GitHub account for a Source Control credential and you have 2FA (Two Factor Authentication) enabled on your account, you will need to use your Personal Access Token in the password field rather than your account password.

</Hint>

### Terraform backend configuration

Terraform is a HashiCorp tool used to automate various infrastructure tasks. Select this credential type to enable synchronization with the Terraform inventory source.

The Terraform credential requires the **Backend configuration** attribute which should contain the data from a [Terraform backend block](https://developer.hashicorp.com/terraform/language/settings/backends/configuration). You can paste, drag a file, browse to upload a file, or click the **Key** icon to populate the field from an external [secret management system](../secret-management). An example configuration for an S3 backend:

```text
bucket = "my-terraform-state-bucket"
key = "path/to/terraform-state-file"
region = "us-east-1"
access_key = "my-aws-access-key"
secret_key = "my-aws-secret-access-key"
```

![Create New Credential form for a Terraform backend configuration credential](/assets/images/credentials-create-terraform-credential.webp)

Saving it stores the file path to the backend configuration in an environment variable `TF_BACKEND_CONFIG_FILE` that is made available to any job with the credential attached.

### Thycotic DevOps Secrets Vault

This is considered part of the secret management capability. See [Thycotic DevOps Secrets Vault](../secret-management#thycotic-devops-secrets-vault) for more detail.

### Thycotic Secret Server

This is considered part of the secret management capability. See [Thycotic Secret Server](../secret-management#thycotic-secret-server) for more detail.

### Vault

A Vault credential provides the password Ansible uses to decrypt Vault-encrypted variables and files when a playbook runs.

![Create New Credential form for a Vault credential](/assets/images/credentials-create-vault-credential.webp)

Vault credentials require the **Vault Password** and an optional **Vault Identifier** if applying multi-Vault credentialing. For more information on Ascender Multi-Vault support, refer to the [Multi-Vault Credentials](/admin-guide/multi-credential-assignment#multi-vault-credentials) section of the [Ascender Administration Guide](/admin-guide).

You may configure Ascender to ask the user for the password at launch time by selecting **Prompt on launch**. In these cases, a dialog opens when the job is launched, prompting the user to enter the password.

<Hint type="warning">

Credentials which are used in *Scheduled Jobs* must not be configured as "**Prompt on launch**".

</Hint>

For more information about Ansible Vault, refer to the [Ansible Vault documentation](http://docs.ansible.com/ansible/playbooks_vault.html).

### VMware vCenter

Selecting this credential type enables synchronization of inventory with VMware vCenter.

Ascender uses the following environment variables for VMware vCenter credentials and are fields prompted in the user interface:

```text
VMWARE_HOST
VMWARE_USER
VMWARE_PASSWORD
VMWARE_VALIDATE_CERTS
```

![Create New Credential form for a VMware vCenter credential](/assets/images/credentials-create-vmware-credential.webp)

VMware credentials have the following inputs that are required:

- **vCenter Host**: The vCenter hostname or IP address to connect to.
- **Username**: The username to use to connect to vCenter.
- **Password**: The password to use to connect to vCenter.

<Hint type="note">

If the VMware guest tools are not running on the instance, VMware inventory sync may not return an IP address for that instance.

</Hint>
