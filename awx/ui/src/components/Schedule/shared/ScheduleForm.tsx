import type { SurveyConfig, LaunchConfig } from 'components/LaunchPrompt/types';
import type { Schedule, Untyped } from 'types/api';
import React, { useEffect, useCallback, useState, useRef } from 'react';
import { DateTime } from 'luxon';
import { useLingui } from '@lingui/react/macro';
import { Formik } from 'formik';
import { RRule } from 'rrule';
import { Button, Form, ActionGroup } from '@patternfly/react-core';
import { Config } from 'contexts/Config';
import { JobTemplatesAPI, SchedulesAPI, WorkflowJobTemplatesAPI } from 'api';
import { dateToInputDateTime } from 'util/dates';
import useRequest from 'hooks/useRequest';
import { parseVariableField } from 'util/yaml';
import ContentError from '../../ContentError';
import ContentLoading from '../../ContentLoading';
import { FormSubmitError } from '../../FormField';
import { FormColumnLayout, FormFullWidthLayout } from '../../FormLayout';
import SchedulePromptableFields from './SchedulePromptableFields';
import ScheduleFormFields from './ScheduleFormFields';
import UnsupportedScheduleForm from './UnsupportedScheduleForm';
import parseRuleObj, { UnsupportedRRuleError } from './parseRuleObj';
import buildRuleObj from './buildRuleObj';
import buildRuleSet from './buildRuleSet';
import mergeArraysByCredentialType from './mergeArraysByCredentialType';
import type {
  FrequencyOptionsMap,
  ScheduleFormValues,
  ScheduleFrequency,
} from './types';

const NUM_DAYS_PER_FREQUENCY: Partial<Record<ScheduleFrequency, number>> = {
  week: 7,
  month: 31,
  year: 365,
};

const defaultSchedule: Schedule = {} as Schedule;

export interface ScheduleFormProps {
  hasDaysToKeepField?: boolean;
  handleCancel: () => void;
  handleSubmit: (values: Untyped, ...rest: Untyped[]) => void;
  schedule?: Schedule;
  submitError?: unknown;
  resource: Untyped;
  launchConfig?: LaunchConfig;
  surveyConfig?: SurveyConfig;
  resourceDefaultCredentials?: Untyped;
  [key: string]: unknown;
}

function ScheduleForm({
  hasDaysToKeepField,
  handleCancel,
  handleSubmit: submitSchedule,
  schedule = defaultSchedule,
  submitError,
  resource,
  launchConfig,
  surveyConfig,
  resourceDefaultCredentials,
}: ScheduleFormProps) {
  const { t } = useLingui();
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isSaveDisabled, setIsSaveDisabled] = useState(false);
  const originalLabels = useRef<Untyped[]>([]);
  const originalInstanceGroups = useRef<Untyped[]>([]);

  let rruleError;
  const now = DateTime.now();
  const closestQuarterHour = DateTime.fromMillis(
    Math.ceil(now.toMillis() / 900000) * 900000
  );
  const tomorrow = closestQuarterHour.plus({ days: 1 });
  const isTemplate =
    resource.type === 'workflow_job_template' ||
    resource.type === 'job_template';
  const {
    request: loadScheduleData,
    error: contentError,
    isLoading: contentLoading,
    result: { zoneOptions, zoneLinks, credentials },
  } = useRequest(
    useCallback(async () => {
      const { data } = await SchedulesAPI.readZoneInfo();

      let creds: Untyped[] = [];
      let allLabels: Untyped[] = [];
      let allInstanceGroups: Untyped[] = [];
      if (schedule.id) {
        if (
          resource.type === 'job_template' &&
          launchConfig?.ask_credential_on_launch
        ) {
          const {
            data: { results },
          } = await SchedulesAPI.readCredentials(schedule.id);
          creds = results;
        }
        if (launchConfig?.ask_labels_on_launch) {
          const {
            data: { results },
          } = await SchedulesAPI.readAllLabels(schedule.id);
          allLabels = results;
        }
        if (
          resource.type === 'job_template' &&
          launchConfig?.ask_instance_groups_on_launch
        ) {
          const {
            data: { results },
          } = await SchedulesAPI.readInstanceGroups(schedule.id);
          allInstanceGroups = results;
        }
      } else {
        if (resource.type === 'job_template') {
          if (launchConfig?.ask_labels_on_launch) {
            const {
              data: { results },
            } = await JobTemplatesAPI.readAllLabels(resource.id);
            allLabels = results;
          }
        }
        if (
          resource.type === 'workflow_job_template' &&
          launchConfig?.ask_labels_on_launch
        ) {
          const {
            data: { results },
          } = await WorkflowJobTemplatesAPI.readAllLabels(resource.id);
          allLabels = results;
        }
      }

      const zones = (data.zones || []).map((zone: unknown) => ({
        value: zone,
        key: zone,
        label: zone,
      }));

      originalLabels.current = allLabels;
      originalInstanceGroups.current = allInstanceGroups;

      return {
        zoneOptions: zones,
        zoneLinks: data.links,
        credentials: creds,
        isLoading: false,
      };
    }, [schedule, resource.id, resource.type, launchConfig]),
    {
      zoneOptions: [],
      zoneLinks: {},
      credentials: [],
      isLoading: true,
    }
  );

  useEffect(() => {
    loadScheduleData();
  }, [loadScheduleData]);

  const missingRequiredInventory = useCallback(() => {
    let missingInventory = false;
    if (
      launchConfig?.inventory_needed_to_start &&
      !schedule?.summary_fields?.inventory?.id
    ) {
      missingInventory = true;
    }
    return missingInventory;
  }, [launchConfig, schedule]);

  const hasMissingSurveyValue = useCallback(() => {
    let missingValues = false;
    if (launchConfig?.survey_enabled) {
      surveyConfig?.spec?.forEach((question: Untyped) => {
        const hasDefaultValue = Boolean(question.default);
        const hasSchedule = Object.keys(schedule).length;
        const isRequired = question.required;
        if (isRequired && !hasDefaultValue) {
          if (!hasSchedule) {
            missingValues = true;
          } else {
            const extraData = (schedule?.extra_data ?? {}) as Record<
              string,
              unknown
            >;
            const hasMatchingKey = Object.keys(extraData).includes(
              question.variable
            );
            Object.values(extraData).forEach((value) => {
              if (!value || !hasMatchingKey) {
                missingValues = true;
              } else {
                missingValues = false;
              }
            });
            if (!Object.values(extraData).length) {
              missingValues = true;
            }
          }
        }
      });
    }
    return missingValues;
  }, [launchConfig, schedule, surveyConfig]);

  const hasCredentialsThatPrompt = useCallback(() => {
    if (launchConfig?.ask_credential_on_launch) {
      if (Object.keys(schedule).length > 0) {
        const defaultCredsWithoutOverrides: Untyped[] = [];

        const credentialHasOverride = (templateDefaultCred: Untyped) => {
          let hasOverride = false;
          credentials.forEach((nodeCredential: Untyped) => {
            if (
              templateDefaultCred.credential_type ===
              nodeCredential.credential_type
            ) {
              if (
                (!templateDefaultCred.vault_id &&
                  !nodeCredential.inputs.vault_id) ||
                (templateDefaultCred.vault_id &&
                  nodeCredential.inputs.vault_id &&
                  templateDefaultCred.vault_id ===
                    nodeCredential.inputs.vault_id)
              ) {
                hasOverride = true;
              }
            }
          });

          return hasOverride;
        };

        if (resourceDefaultCredentials) {
          resourceDefaultCredentials.forEach((defaultCred: unknown) => {
            if (!credentialHasOverride(defaultCred)) {
              defaultCredsWithoutOverrides.push(defaultCred);
            }
          });
        }

        return (
          credentials
            .concat(defaultCredsWithoutOverrides)
            .filter((credential: Untyped) => {
              let credentialRequiresPass = false;

              Object.entries(credential.inputs).forEach(([key, value]) => {
                if (key !== 'vault_id' && value === 'ASK') {
                  credentialRequiresPass = true;
                }
              });

              return credentialRequiresPass;
            }).length > 0
        );
      }

      return launchConfig?.defaults?.credentials
        ? launchConfig.defaults.credentials.filter(
            (credential: Untyped) => credential?.passwords_needed.length > 0
          ).length > 0
        : false;
    }

    return false;
  }, [launchConfig, schedule, credentials, resourceDefaultCredentials]);

  useEffect(() => {
    if (
      isTemplate &&
      (missingRequiredInventory() ||
        hasMissingSurveyValue() ||
        hasCredentialsThatPrompt())
    ) {
      setIsSaveDisabled(true);
    }
  }, [
    isTemplate,
    hasMissingSurveyValue,
    missingRequiredInventory,
    hasCredentialsThatPrompt,
  ]);

  let showPromptButton = false;

  if (
    launchConfig &&
    (launchConfig.ask_inventory_on_launch ||
      launchConfig.ask_variables_on_launch ||
      launchConfig.ask_job_type_on_launch ||
      launchConfig.ask_limit_on_launch ||
      launchConfig.ask_credential_on_launch ||
      launchConfig.ask_scm_branch_on_launch ||
      launchConfig.ask_tags_on_launch ||
      launchConfig.ask_skip_tags_on_launch ||
      launchConfig.ask_execution_environment_on_launch ||
      launchConfig.ask_labels_on_launch ||
      launchConfig.ask_forks_on_launch ||
      launchConfig.ask_job_slice_count_on_launch ||
      launchConfig.ask_timeout_on_launch ||
      launchConfig.ask_instance_groups_on_launch ||
      launchConfig.survey_enabled ||
      launchConfig.inventory_needed_to_start ||
      (launchConfig.variables_needed_to_start?.length ?? 0) > 0)
  ) {
    showPromptButton = true;
  }
  const [currentDate, time] = dateToInputDateTime(
    closestQuarterHour.toISO() as string
  );

  const [tomorrowDate] = dateToInputDateTime(tomorrow.toISO() as string);
  const initialFrequencyOptions: FrequencyOptionsMap = {
    minute: {
      interval: 1,
      end: 'never',
      occurrences: 1,
      endDate: tomorrowDate,
      endTime: time,
    },
    hour: {
      interval: 1,
      end: 'never',
      occurrences: 1,
      endDate: tomorrowDate,
      endTime: time,
    },
    day: {
      interval: 1,
      end: 'never',
      occurrences: 1,
      endDate: tomorrowDate,
      endTime: time,
    },
    week: {
      interval: 1,
      end: 'never',
      occurrences: 1,
      endDate: tomorrowDate,
      endTime: time,
      daysOfWeek: [],
    },
    month: {
      interval: 1,
      end: 'never',
      occurrences: 1,
      endDate: tomorrowDate,
      endTime: time,
      runOn: 'day',
      runOnTheOccurrence: 1,
      runOnTheDay: 'sunday',
      runOnDayNumber: 1,
    },
    year: {
      interval: 1,
      end: 'never',
      occurrences: 1,
      endDate: tomorrowDate,
      endTime: time,
      runOn: 'day',
      runOnTheOccurrence: 1,
      runOnTheDay: 'sunday',
      runOnTheMonth: 1,
      runOnDayMonth: 1,
      runOnDayNumber: 1,
    },
  };

  const initialValues: ScheduleFormValues & { daysToKeep?: number } = {
    description: schedule.description || '',
    frequency: [],
    exceptionFrequency: [],
    frequencyOptions: initialFrequencyOptions,
    exceptionOptions: initialFrequencyOptions,
    name: schedule.name || '',
    startDate: currentDate as string,
    startTime: time as string,
    timezone: schedule.timezone || (now.zoneName as string),
    credentials: mergeArraysByCredentialType(
      resourceDefaultCredentials,
      credentials
    ),
    labels: originalLabels.current,
    instance_groups: originalInstanceGroups.current,
  };

  if (hasDaysToKeepField) {
    let initialDaysToKeep = 30;
    if (schedule?.extra_data) {
      if (
        typeof schedule?.extra_data === 'string' &&
        schedule?.extra_data !== ''
      ) {
        initialDaysToKeep = parseVariableField(schedule?.extra_data)
          .days as number;
      }
      if (typeof schedule?.extra_data === 'object') {
        initialDaysToKeep = (schedule.extra_data as { days: number })?.days;
      }
    }
    initialValues.daysToKeep = initialDaysToKeep;
  }

  let overriddenValues: Partial<ScheduleFormValues> = {};
  if (schedule.rrule) {
    try {
      overriddenValues = parseRuleObj(schedule);
    } catch (error) {
      if (error instanceof UnsupportedRRuleError) {
        return (
          <UnsupportedScheduleForm
            schedule={schedule}
            handleCancel={handleCancel}
          />
        );
      }
      rruleError = error;
    }
  } else if (schedule.id) {
    rruleError = new Error(t`Schedule is missing rrule`);
  }

  if (contentError || rruleError) {
    return <ContentError error={contentError || rruleError} />;
  }

  if (contentLoading) {
    return <ContentLoading />;
  }

  // Formik's error shape mirrors the values it validates: one message per
  // scalar field, and one nested object per frequency's options.
  const validate = (values: ScheduleFormValues) => {
    const errors: {
      startDate?: string;
      exceptionFrequency?: string;
      frequencyOptions?: Partial<
        Record<ScheduleFrequency, Record<string, string>>
      >;
    } = {};

    values.frequency.forEach((freq: ScheduleFrequency) => {
      const options = values.frequencyOptions[freq];
      const freqErrors: Record<string, string> = {};

      if (!options) {
        return;
      }

      if (
        (freq === 'month' || freq === 'year') &&
        options.runOn === 'day' &&
        ((options.runOnDayNumber as number) < 1 ||
          (options.runOnDayNumber as number) > 31)
      ) {
        freqErrors.runOn = t`Please select a day number between 1 and 31.`;
      }

      if (options.end === 'after' && !options.occurrences) {
        freqErrors.occurrences = t`Please enter a number of occurrences.`;
      }

      if (options.end === 'onDate') {
        if (
          DateTime.fromFormat(
            `${values.startDate} ${values.startTime}`,
            'yyyy-LL-dd h:mm a'
          ).toMillis() >=
          DateTime.fromFormat(
            `${options.endDate} ${options.endTime}`,
            'yyyy-LL-dd h:mm a'
          ).toMillis()
        ) {
          freqErrors.endDate = t`Please select an end date/time that comes after the start date/time.`;
        }

        // Only the frequencies in the map have a minimum span; for the rest
        // this comparison was against undefined and never held.
        const minDays = NUM_DAYS_PER_FREQUENCY[freq];
        const spanInDays = DateTime.fromISO(options.endDate)
          .diff(DateTime.fromISO(values.startDate as string), 'days')
          .toObject().days as number;
        if (minDays !== undefined && spanInDays < minDays) {
          const rule = new RRule(
            buildRuleObj({
              startDate: values.startDate,
              startTime: values.startTime,
              frequency: freq,
              ...options,
            })
          );
          if (rule.all().length === 0) {
            errors.startDate = t`Selected date range must have at least 1 schedule occurrence.`;
            freqErrors.endDate = t`Selected date range must have at least 1 schedule occurrence.`;
          }
        }
      }
      if (Object.keys(freqErrors).length > 0) {
        if (!errors.frequencyOptions) {
          errors.frequencyOptions = {};
        }
        errors.frequencyOptions[freq] = freqErrors;
      }
    });

    if (values.exceptionFrequency.length > 0 && !scheduleHasInstances(values)) {
      errors.exceptionFrequency = t`This schedule has no occurrences due to the selected exceptions.`;
    }

    return errors;
  };

  return (
    <Config>
      {() => (
        <Formik
          initialValues={{
            ...initialValues,
            ...overriddenValues,
            frequencyOptions: {
              ...initialValues.frequencyOptions,
              ...overriddenValues.frequencyOptions,
            },
            exceptionOptions: {
              ...initialValues.exceptionOptions,
              ...overriddenValues.exceptionOptions,
            },
          }}
          onSubmit={(values) => {
            submitSchedule(
              values,
              launchConfig,
              surveyConfig,
              originalInstanceGroups.current,
              originalLabels.current,
              credentials
            );
          }}
          validate={validate}
        >
          {(formik) => (
            <Form autoComplete="off" onSubmit={formik.handleSubmit}>
              <FormColumnLayout>
                <ScheduleFormFields
                  hasDaysToKeepField={hasDaysToKeepField}
                  zoneOptions={zoneOptions}
                  zoneLinks={zoneLinks}
                />
                {isWizardOpen && (
                  <SchedulePromptableFields
                    schedule={schedule}
                    credentials={credentials}
                    surveyConfig={surveyConfig}
                    launchConfig={launchConfig}
                    resource={resource}
                    onCloseWizard={() => {
                      setIsWizardOpen(false);
                    }}
                    onSave={() => {
                      setIsWizardOpen(false);
                      setIsSaveDisabled(false);
                    }}
                    resourceDefaultCredentials={resourceDefaultCredentials}
                    labels={originalLabels.current}
                    instanceGroups={originalInstanceGroups.current}
                  />
                )}
                <FormSubmitError error={submitError} />
                <FormFullWidthLayout>
                  <ActionGroup>
                    <Button
                      ouiaId="schedule-form-save-button"
                      aria-label={t`Save`}
                      variant="primary"
                      type="button"
                      onClick={() => formik.handleSubmit()}
                      isDisabled={isSaveDisabled}
                    >
                      {t`Save`}
                    </Button>

                    {isTemplate && showPromptButton && (
                      <Button
                        ouiaId="schedule-form-prompt-button"
                        variant="secondary"
                        type="button"
                        aria-label={t`Prompt`}
                        onClick={() => setIsWizardOpen(true)}
                      >
                        {t`Prompt`}
                      </Button>
                    )}
                    <Button
                      ouiaId="schedule-form-cancel-button"
                      aria-label={t`Cancel`}
                      variant="secondary"
                      type="button"
                      onClick={handleCancel}
                    >
                      {t`Cancel`}
                    </Button>
                  </ActionGroup>
                </FormFullWidthLayout>
              </FormColumnLayout>
            </Form>
          )}
        </Formik>
      )}
    </Config>
  );
}

export default ScheduleForm;

function scheduleHasInstances(values: ScheduleFormValues) {
  let rangeToCheck = 1;
  values.frequency.forEach((freq: ScheduleFrequency) => {
    const days = NUM_DAYS_PER_FREQUENCY[freq];
    if (days !== undefined && days > rangeToCheck) {
      rangeToCheck = days;
    }
  });

  const ruleSet = buildRuleSet(values, true);
  const startDate = DateTime.fromISO(values.startDate as string);
  const endDate = startDate.plus({ days: rangeToCheck });
  const instances = ruleSet.between(
    startDate.toJSDate(),
    endDate.toJSDate(),
    true,
    (date, i) => i === 0
  );

  return instances.length > 0;
}
