import React from 'react';
import { msg } from '@lingui/macro';

const getProjectHelpText = (i18n) => ({
  executionEnvironment: i18n._(
    msg`The execution environment that will be used for jobs that use this project. This will be used as fallback when an execution environment has not been explicitly assigned at the job template or workflow level.`
  ),
  projectBasePath: (brandName = '') => (
    <span>
      {i18n._(msg`Base path used for locating playbooks. Directories
              found inside this path will be listed in the playbook directory drop-down.
              Together the base path and selected playbook directory provide the full
              path used to locate playbooks.`)}
      <br />
      <br />
      {i18n._(msg`Change PROJECTS_ROOT when deploying
              ${brandName} to change this location.`)}
    </span>
  ),
  projectLocalPath: i18n._(msg`Select from the list of directories found in
          the Project Base Path. Together the base path and the playbook
          directory provide the full path used to locate playbooks.`),
  githubSourceControlUrl: (
    <span>
      {i18n._(msg`Example URLs for GIT Source Control include:`)}
      <ul css="margin: 10px 0 10px 20px">
        <li>
          <code>https://github.com/ansible/ansible.git</code>
        </li>
        <li>
          <code>git@github.com:ansible/ansible.git</code>
        </li>
        <li>
          <code>git://servername.example.com/ansible.git</code>
        </li>
      </ul>
      {i18n._(msg`Note: When using SSH protocol for GitHub or
            Bitbucket, enter an SSH key only, do not enter a username
            (other than git). Additionally, GitHub and Bitbucket do
            not support password authentication when using SSH. GIT
            read only protocol (git://) does not use username or
            password information.`)}
    </span>
  ),
  svnSourceControlUrl: (
    <span>
      {i18n._(msg`Example URLs for Subversion Source Control include:`)}
      <ul css={{ margin: '10px 0 10px 20px' }}>
        <li>
          <code>https://github.com/ansible/ansible</code>
        </li>
        <li>
          <code>svn://servername.example.com/path</code>
        </li>
        <li>
          <code>svn+ssh://servername.example.com/path</code>
        </li>
      </ul>
    </span>
  ),
  syncButtonDisabled: i18n._(
    msg`This project is currently on sync and cannot be clicked until sync process completed`
  ),
  archiveUrl: (
    <span>
      {i18n._(msg`Example URLs for Remote Archive Source Control include:`)}
      <ul css={{ margin: '10px 0 10px 20px' }}>
        <li>
          <code>https://github.com/username/project/archive/v0.0.1.tar.gz</code>
        </li>
        <li>
          <code>https://github.com/username/project/archive/v0.0.2.zip</code>
        </li>
      </ul>
    </span>
  ),

  sourceControlRefspec: (url = '') => (
    <span>
      {i18n._(msg`A refspec to fetch (passed to the Ansible git
            module). This parameter allows access to references via
            the branch field not otherwise available.`)}
      <br />
      <br />
      {i18n._(msg`Note: This field assumes the remote name is "origin".`)}
      <br />
      <br />
      {i18n._(msg`Examples include:`)}
      <ul css={{ margin: '10px 0 10px 20px' }}>
        <li>
          <code>refs/*:refs/remotes/origin/*</code>
        </li>
        <li>
          <code>refs/pull/62/head:refs/remotes/origin/pull/62/head</code>
        </li>
      </ul>
      {i18n._(msg`The first fetches all references. The second
            fetches the Github pull request number 62, in this example
            the branch needs to be "pull/62/head".`)}
      <br />
      <br />
      {i18n._(msg`For more information, refer to the`)}{' '}
      <a target="_blank" rel="noopener noreferrer" href={`${url}`}>
        {i18n._(msg`Documentation.`)}
      </a>
    </span>
  ),
  branchFormField: i18n._(msg`Branch to checkout. In addition to branches,
        you can input tags, commit hashes, and arbitrary refs. Some
        commit hashes and refs may not be available unless you also
        provide a custom refspec.`),
  signatureValidation:
    i18n._(msg`Enable content signing to verify that the content
has remained secure when a project is synced.
If the content has been tampered with, the
job will not run.`),
  options: {
    clean: i18n._(
      msg`Remove any local modifications prior to performing an update.`
    ),
    delete: i18n._(msg`Delete the local repository in its entirety prior to
                  performing an update. Depending on the size of the
                  repository this may significantly increase the amount
                  of time required to complete an update.`),
    trackSubModules: i18n._(msg`Submodules will track the latest commit on
                  their master branch (or other branch specified in
                  .gitmodules). If no, submodules will be kept at
                  the revision specified by the main project.
                  This is equivalent to specifying the --remote
                  flag to git submodule update.`),
    updateOnLaunch:
      i18n._(msg`Each time a job runs using this project, update the
                  revision of the project prior to starting the job.`),
    allowBranchOverride:
      i18n._(msg`Allow changing the Source Control branch or revision in a job
                    template that uses this project.`),
    cacheTimeout: i18n._(msg`Time in seconds to consider a project
                    to be current. During job runs and callbacks the task
                    system will evaluate the timestamp of the latest project
                    update. If it is older than Cache Timeout, it is not
                    considered current, and a new project update will be
                    performed.`),
  },
});

export default getProjectHelpText;
