import type { SettingConfig } from 'types/api';
import React from 'react';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import ResourceTabs from 'components/ResourceTabs';
import {
  BooleanField,
  InputField,
  ObjectField,
  ChoiceField,
  SettingsEditForm,
} from '../../shared';
import { groupFromPath } from '../../shared/settingGroups';
import { GROUPS } from '../groups';

function JobsEdit() {
  const { t, i18n } = useLingui();
  const { pathname } = useLocation();
  // The tab being edited, which is the only group this form shows: a field
  // whose setting is not in the group has no configuration to render from.
  const group = groupFromPath(GROUPS, pathname);
  const is = (id: string) => group.id === id;

  return (
    <>
      <ResourceTabs
        aria-label={t`Jobs tabs`}
        ouiaId="jobs-edit-tabs"
        tabs={GROUPS.map(({ id, label }) => ({
          label: i18n._(label),
          path: `/job_settings/edit/${id}`,
        }))}
      />
      <SettingsEditForm
        category="jobs"
        detailUrl={`/job_settings/${group.id}`}
        only={group.keys}
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
              {/* One tab's fields, which are the only ones this form shows:
                  a field that renders nothing still registers what it would
                  validate, so the others cannot be left mounted. */}
              {is('timeouts') && (
                <>
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
                    name="ASCENDER_RUNNER_KEEPALIVE_SECONDS"
                    config={jobs.ASCENDER_RUNNER_KEEPALIVE_SECONDS ?? null}
                    type={
                      jobs?.ASCENDER_RUNNER_KEEPALIVE_SECONDS
                        ? 'number'
                        : undefined
                    }
                  />
                </>
              )}
              {is('limits') && (
                <>
                  <InputField
                    name="MAX_FORKS"
                    config={jobs.MAX_FORKS}
                    type="number"
                  />
                  {/* Three the screen has always shown and never let anybody
                  change: on a tab called Limits, two of the five being read
                  only reads as a form that forgot them. */}
                  <InputField
                    name="MAX_WEBSOCKET_EVENT_RATE"
                    config={jobs.MAX_WEBSOCKET_EVENT_RATE ?? null}
                    type={jobs?.MAX_WEBSOCKET_EVENT_RATE ? 'number' : undefined}
                  />
                  <InputField
                    name="SCHEDULE_MAX_JOBS"
                    config={jobs.SCHEDULE_MAX_JOBS ?? null}
                    type={jobs?.SCHEDULE_MAX_JOBS ? 'number' : undefined}
                    isRequired={Boolean(jobs?.SCHEDULE_MAX_JOBS)}
                  />
                  <BooleanField
                    name="ASCENDER_AUTO_STATS_ENABLED"
                    config={jobs.ASCENDER_AUTO_STATS_ENABLED ?? null}
                  />
                  <InputField
                    name="ASCENDER_AUTO_STATS_MAX_HOSTS"
                    config={jobs.ASCENDER_AUTO_STATS_MAX_HOSTS ?? null}
                    type={
                      jobs?.ASCENDER_AUTO_STATS_MAX_HOSTS ? 'number' : undefined
                    }
                  />
                </>
              )}
              {is('execution') && (
                <>
                  <InputField
                    name="ASCENDER_ISOLATION_BASE_PATH"
                    config={jobs.ASCENDER_ISOLATION_BASE_PATH ?? null}
                    isRequired={Boolean(jobs?.ASCENDER_ISOLATION_BASE_PATH)}
                  />
                  <ObjectField
                    name="ASCENDER_ISOLATION_SHOW_PATHS"
                    config={jobs.ASCENDER_ISOLATION_SHOW_PATHS}
                  />
                  <BooleanField
                    name="ASCENDER_MOUNT_ISOLATED_PATHS_ON_K8S"
                    config={jobs.ASCENDER_MOUNT_ISOLATED_PATHS_ON_K8S}
                  />
                  <ObjectField
                    name="DEFAULT_CONTAINER_RUN_OPTIONS"
                    config={jobs.DEFAULT_CONTAINER_RUN_OPTIONS}
                  />
                  <ObjectField
                    name="ASCENDER_TASK_ENV"
                    config={jobs.ASCENDER_TASK_ENV}
                  />
                  <ObjectField
                    name="ASCENDER_ANSIBLE_CALLBACK_PLUGINS"
                    config={jobs.ASCENDER_ANSIBLE_CALLBACK_PLUGINS}
                  />
                  <BooleanField
                    name="ENABLE_ANSIBLE_29"
                    config={jobs.ENABLE_ANSIBLE_29}
                  />
                </>
              )}
              {is('content') && (
                <>
                  <BooleanField
                    name="ASCENDER_ROLES_ENABLED"
                    config={jobs.ASCENDER_ROLES_ENABLED}
                  />
                  <BooleanField
                    name="ASCENDER_COLLECTIONS_ENABLED"
                    config={jobs.ASCENDER_COLLECTIONS_ENABLED}
                  />
                  <BooleanField
                    name="GALAXY_IGNORE_CERTS"
                    config={jobs.GALAXY_IGNORE_CERTS}
                  />
                  <ObjectField
                    name="GALAXY_TASK_ENV"
                    config={jobs.GALAXY_TASK_ENV}
                  />
                </>
              )}
              {is('misc') && (
                <>
                  <ObjectField
                    name="AD_HOC_COMMANDS"
                    config={jobs.AD_HOC_COMMANDS}
                  />
                  <ChoiceField
                    name="ALLOW_JINJA_IN_EXTRA_VARS"
                    config={jinja}
                  />
                  <BooleanField
                    name="PROJECT_UPDATE_VVV"
                    config={jobs.PROJECT_UPDATE_VVV}
                  />
                  <BooleanField
                    name="ASCENDER_SHOW_PLAYBOOK_LINKS"
                    config={jobs.ASCENDER_SHOW_PLAYBOOK_LINKS}
                  />
                </>
              )}
            </>
          );
        }}
      </SettingsEditForm>
    </>
  );
}

export default JobsEdit;
