import type { SettingConfig } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import {
  BooleanField,
  InputField,
  ObjectField,
  ChoiceField,
  SettingsEditForm,
} from '../../shared';

function JobsEdit() {
  const { t } = useLingui();
  return (
    <SettingsEditForm
      category="jobs"
      detailUrl="/settings/jobs/details"
      except={['EVENT_STDOUT_MAX_BYTES_DISPLAY', 'STDOUT_MAX_BYTES_DISPLAY']}
    >
      {(jobs) => {
        // The API labels the 'template' choice 'Only Template Variables and
        // Definitions', which matches neither the help text nor what the detail
        // screen renders. Relabelled here for consistency, as it was before.
        const jinja: SettingConfig = {
          default: 'template',
          help_text: jobs?.ALLOW_JINJA_IN_EXTRA_VARS?.help_text,
          label: jobs?.ALLOW_JINJA_IN_EXTRA_VARS?.label,
          choices: jobs?.ALLOW_JINJA_IN_EXTRA_VARS?.choices?.map(
            ([value, label]) =>
              value === 'template' ? [value, t`Template`] : [value, label]
          ),
        };
        return (
          <>
            <InputField
              name="ASCENDER_ISOLATION_BASE_PATH"
              config={jobs.ASCENDER_ISOLATION_BASE_PATH ?? null}
              isRequired={Boolean(jobs?.ASCENDER_ISOLATION_BASE_PATH)}
            />
            <InputField
              name="SCHEDULE_MAX_JOBS"
              config={jobs.SCHEDULE_MAX_JOBS ?? null}
              type={jobs?.SCHEDULE_MAX_JOBS ? 'number' : undefined}
              isRequired={Boolean(jobs?.SCHEDULE_MAX_JOBS)}
            />
            <InputField
              name="ASCENDER_RUNNER_KEEPALIVE_SECONDS"
              config={jobs.ASCENDER_RUNNER_KEEPALIVE_SECONDS ?? null}
              type={
                jobs?.ASCENDER_RUNNER_KEEPALIVE_SECONDS ? 'number' : undefined
              }
            />
            <InputField
              name="DEFAULT_JOB_TIMEOUT"
              config={jobs.DEFAULT_JOB_TIMEOUT}
              type="number"
            />
            <InputField
              name="DEFAULT_JOB_IDLE_TIMEOUT"
              config={jobs.DEFAULT_JOB_IDLE_TIMEOUT}
              type="number"
            />
            <InputField
              name="DEFAULT_INVENTORY_UPDATE_TIMEOUT"
              config={jobs.DEFAULT_INVENTORY_UPDATE_TIMEOUT}
              type="number"
            />
            <InputField
              name="DEFAULT_PROJECT_UPDATE_TIMEOUT"
              config={jobs.DEFAULT_PROJECT_UPDATE_TIMEOUT}
              type="number"
            />
            <InputField
              name="ANSIBLE_FACT_CACHE_TIMEOUT"
              config={jobs.ANSIBLE_FACT_CACHE_TIMEOUT}
              type="number"
            />
            <InputField
              name="MAX_FORKS"
              config={jobs.MAX_FORKS}
              type="number"
            />
            <ChoiceField name="ALLOW_JINJA_IN_EXTRA_VARS" config={jinja} />
            <BooleanField
              name="PROJECT_UPDATE_VVV"
              config={jobs.PROJECT_UPDATE_VVV}
            />
            <BooleanField
              name="GALAXY_IGNORE_CERTS"
              config={jobs.GALAXY_IGNORE_CERTS}
            />
            <BooleanField
              name="ASCENDER_ROLES_ENABLED"
              config={jobs.ASCENDER_ROLES_ENABLED}
            />
            <BooleanField
              name="ASCENDER_COLLECTIONS_ENABLED"
              config={jobs.ASCENDER_COLLECTIONS_ENABLED}
            />
            <BooleanField
              name="ENABLE_ANSIBLE_29"
              config={jobs.ENABLE_ANSIBLE_29}
            />
            <BooleanField
              name="ASCENDER_SHOW_PLAYBOOK_LINKS"
              config={jobs.ASCENDER_SHOW_PLAYBOOK_LINKS}
            />
            <BooleanField
              name="ASCENDER_MOUNT_ISOLATED_PATHS_ON_K8S"
              config={jobs.ASCENDER_MOUNT_ISOLATED_PATHS_ON_K8S}
            />
            <ObjectField name="AD_HOC_COMMANDS" config={jobs.AD_HOC_COMMANDS} />
            <ObjectField
              name="DEFAULT_CONTAINER_RUN_OPTIONS"
              config={jobs.DEFAULT_CONTAINER_RUN_OPTIONS}
            />
            <ObjectField
              name="ASCENDER_ANSIBLE_CALLBACK_PLUGINS"
              config={jobs.ASCENDER_ANSIBLE_CALLBACK_PLUGINS}
            />
            <ObjectField
              name="ASCENDER_ISOLATION_SHOW_PATHS"
              config={jobs.ASCENDER_ISOLATION_SHOW_PATHS}
            />
            <ObjectField
              name="ASCENDER_TASK_ENV"
              config={jobs.ASCENDER_TASK_ENV}
            />
            <ObjectField name="GALAXY_TASK_ENV" config={jobs.GALAXY_TASK_ENV} />
          </>
        );
      }}
    </SettingsEditForm>
  );
}

export default JobsEdit;
