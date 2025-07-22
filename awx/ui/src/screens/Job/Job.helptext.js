import React from 'react';
import { msg } from '@lingui/macro';
import { i18n } from '@lingui/core';

const jobHelpText = () => ({
  jobType: i18n._(
    msg`For job templates, select run to execute the playbook. Select check to only check playbook syntax, test environment setup, and report problems without executing the playbook.`
  ),
  inventory: i18n._(
    msg`Select the inventory containing the hosts you want this job to manage.`
  ),
  project: i18n._(
    msg`The project containing the playbook this job will execute.`
  ),
  project_source: i18n._(
    msg`The project from which this inventory update is sourced.`
  ),
  executionEnvironment: i18n._(
    msg`The execution environment that will be used when launching this job template. The resolved execution environment can be overridden by explicitly assigning a different one to this job template.`
  ),
  playbook: i18n._(msg`Select the playbook to be executed by this job.`),
  credentials: i18n._(
    msg`Select credentials for accessing the nodes this job will be ran against. You can only select one credential of each type. For machine credentials (SSH), checking "Prompt on launch" without selecting credentials will require you to select a machine credential at run time. If you select credentials and check "Prompt on launch", the selected credential(s) become the defaults that can be updated at run time.`
  ),
  labels: i18n._(
    msg`Optional labels that describe this job template, such as 'dev' or 'test'. Labels can be used to group and filter job templates and completed jobs.`
  ),
  variables: i18n._(
    msg`Pass extra command line variables to the playbook. This is the -e or --extra-vars command line parameter for ansible-playbook. Provide key/value pairs using either YAML or JSON. Refer to the documentation for example syntax.`
  ),
  limit: i18n._(
    msg`Provide a host pattern to further constrain the list of hosts that will be managed or affected by the playbook. Multiple patterns are allowed. Refer to Ansible documentation for more information and examples on patterns.`
  ),
  verbosity: i18n._(
    msg`Control the level of output ansible will produce as the playbook executes.`
  ),
  jobSlicing: i18n._(
    msg`Divide the work done by this job template into the specified number of job slices, each running the same tasks against a portion of the inventory.`
  ),
  timeout: i18n._(
    msg`The amount of time (in seconds) to run before the job is canceled. Defaults to 0 for no job timeout.`
  ),
  instanceGroups: i18n._(
    msg`Select the Instance Groups for this Job Template to run on.`
  ),
  jobTags: i18n._(
    msg`Tags are useful when you have a large playbook, and you want to run a specific part of a play or task. Use commas to separate multiple tags. Refer to the documentation for details on the usage of tags.`
  ),
  skipTags: i18n._(
    msg`Skip tags are useful when you have a large playbook, and you want to skip specific parts of a play or task. Use commas to separate multiple tags. Refer to the documentation for details on the usage of tags.`
  ),
  sourceControlBranch: i18n._(
    msg`Select a branch for the workflow. This branch is applied to all job template nodes that prompt for a branch.`
  ),
  projectUpdate: i18n._(msg`Project checkout results`),
  forks: (
    <span>
      {i18n._(
        msg`The number of parallel or simultaneous processes to use while executing the playbook. An empty value, or a value less than 1 will use the Ansible default which is usually 5. The default number of forks can be overwritten with a change to`
      )}{' '}
      <code>ansible.cfg</code>.{' '}
      {i18n._(
        msg`Refer to the Ansible documentation for details about the configuration file.`
      )}
    </span>
  ),
  module: (moduleName) =>
    moduleName ? (
      <>
        {i18n._(
          msg`These arguments are used with the specified module. You can find information about ${moduleName} by clicking `
        )}{' '}
        <a
          href={`https://docs.ansible.com/ansible/latest/modules/${moduleName}_module.html`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {i18n._(msg`here.`)}
        </a>
      </>
    ) : (
      i18n._(msg`These arguments are used with the specified module.`)
    ),
});

export default jobHelpText;
