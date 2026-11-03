import type { SurveyQuestion } from 'components/LaunchPrompt/types';
import type {
  Label,
  LaunchConfig,
  LaunchCredential,
  NodeTemplate,
  Schedule,
  SummaryFieldRef,
  SurveyConfig,
} from 'types/api';
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Card } from '@patternfly/react-core';
import { OrganizationsAPI, SchedulesAPI } from 'api';
import { getAddedAndRemoved } from 'util/lists';
import mergeExtraVars from 'util/prompt/mergeExtraVars';
import getSurveyValues from 'util/prompt/getSurveyValues';
import createNewLabels from 'util/labels';
import type { LabelInput } from 'util/labels';
import ScheduleForm from '../shared/ScheduleForm';
import buildRuleSet from '../shared/buildRuleSet';
import { CardBody } from '../../Card';
import type { ScheduleFormValues } from '../shared/types';

export interface ScheduleEditProps {
  hasDaysToKeepField?: boolean;
  schedule: Schedule;
  resource: NodeTemplate;
  launchConfig?: LaunchConfig;
  surveyConfig?: SurveyConfig | null;
  resourceDefaultCredentials?: LaunchCredential[] | null;
  [key: string]: unknown;
}

/**
 * The extra_data to save, starting from what the schedule already holds.
 *
 * The prompt values (the survey answers as survey_ fields and the variables
 * as extra_vars) only reach the form once the Prompt wizard has been opened,
 * which loads them from the schedule. Before that the form has neither, and
 * building extra_data from nothing replaced the saved variables with the
 * survey defaults and dropped every other variable. So an edit that never
 * opened the wizard keeps extra_data as it was, only adding defaults for
 * survey questions it has no answer to, and one that did starts from the
 * loaded values, which are the schedule's saved answers.
 *
 * Args:
 *   values: the form values at submit.
 *   schedule: the schedule being edited, as loaded.
 *   launchConfig: the template's launch configuration.
 *   surveyConfig: the template's survey, if it has one.
 *
 * Returns:
 *   The extra_data object for the request body.
 */
function buildExtraData(
  values: ScheduleFormValues,
  schedule: Schedule,
  launchConfig?: LaunchConfig,
  surveyConfig?: SurveyConfig | null
): Record<string, unknown> {
  const saved = { ...((schedule.extra_data ?? {}) as Record<string, unknown>) };
  const keys = Object.keys(values);
  const hasVariables = keys.includes('extra_vars');
  const hasSurvey = keys.some((key) => key.startsWith('survey_'));
  if (!hasVariables && !hasSurvey) {
    // Nothing the schedule holds is touched. A survey question it has no
    // answer for takes the question's default, which is what a new schedule
    // saved without opening the wizard gets as well.
    surveyConfig?.spec?.forEach((question: SurveyQuestion) => {
      if (!(question.variable in saved) && question.default !== undefined) {
        saved[question.variable] = question.default;
      }
    });
    return saved;
  }

  // The variables editor, when it was loaded, is the whole set of variables;
  // otherwise the schedule's own stay as they are.
  let base: Record<string, unknown> = saved;
  if (hasVariables && launchConfig?.ask_variables_on_launch) {
    base = mergeExtraVars((values.extra_vars as string) || '---', {});
  }
  if (!hasSurvey || !surveyConfig?.spec) {
    return base;
  }

  // The survey fields are the answers. A question left blank is not in
  // surveyValues, so its saved answer is taken out of the base rather than
  // carried back in from it.
  const surveyValues = getSurveyValues(values);
  const withoutAnswers = { ...base };
  surveyConfig.spec.forEach((question: SurveyQuestion) => {
    delete withoutAnswers[question.variable];
  });
  return { ...withoutAnswers, ...surveyValues };
}

function ScheduleEdit({
  hasDaysToKeepField,
  schedule,
  resource,
  launchConfig,
  surveyConfig,
  resourceDefaultCredentials,
}: ScheduleEditProps) {
  const [formSubmitError, setFormSubmitError] = useState<unknown>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
  const pathRoot = pathname.substring(0, pathname.indexOf('schedules'));

  const handleSubmit = async (
    values: ScheduleFormValues,
    launchConfiguration?: LaunchConfig,
    surveyConfiguration?: SurveyConfig | null,
    originalInstanceGroups: SummaryFieldRef[] = [],
    originalLabels: Label[] = [],
    scheduleCredentials: LaunchCredential[] = []
  ) => {
    const {
      execution_environment,
      instance_groups,
      inventory,
      credentials = [],
      frequency,
      frequencyOptions,
      exceptionFrequency,
      exceptionOptions,
      timezone,
      labels,
      ...rest
    } = values;
    // What is left of the form values is the request body, which the handler
    // then adds the derived rrule and extra_data to.
    const submitValues: Record<string, unknown> = rest;
    submitValues.extra_data = buildExtraData(
      values,
      schedule,
      launchConfiguration,
      surveyConfiguration
    );
    delete values.extra_vars;
    if (inventory) {
      submitValues.inventory = inventory.id;
    }
    // A blank limit on a resource with none of its own is no answer at all.
    // Stored as an empty string it would still override, and on a workflow
    // it replaces every node's own limit with none on each scheduled run.
    if (submitValues.limit === '' && !resource?.limit) {
      submitValues.limit = null;
    }

    if (execution_environment) {
      submitValues.execution_environment = execution_environment.id;
    }

    try {
      if (launchConfiguration?.ask_labels_on_launch) {
        // createNewLabels is async: without the await both of these came back
        // undefined, and editing a schedule that prompts for labels dropped
        // every label it had.
        const { labelIds, error } = await createNewLabels(
          values.labels as LabelInput[],
          resource.organization
        );

        if (error) {
          setFormSubmitError(error);
        } else {
          submitValues.labels = labelIds;
        }
      }

      const ruleSet = buildRuleSet(values as ScheduleFormValues);
      const requestData: Record<string, unknown> = {
        ...submitValues,
        rrule: ruleSet.toString().replace(/\n/g, ' '),
      };
      delete requestData.startDate;
      delete requestData.startTime;

      if (Object.keys(values).includes('daysToKeep')) {
        if (!requestData.extra_data) {
          requestData.extra_data = JSON.stringify({
            days: values.daysToKeep,
          });
        } else {
          const extraData = (
            typeof requestData.extra_data === 'string'
              ? JSON.parse(requestData.extra_data)
              : requestData.extra_data
          ) as Record<string, unknown>;
          extraData.days = values.daysToKeep;
          requestData.extra_data = extraData;
        }
      }

      const {
        data: { id: scheduleId },
      } = await SchedulesAPI.update(schedule.id, requestData);

      const { added: addedCredentials, removed: removedCredentials } =
        getAddedAndRemoved(
          [
            ...(resource?.summary_fields?.credentials ?? []),
            ...scheduleCredentials,
          ],
          credentials
        );

      const { added: addedLabels, removed: removedLabels } = getAddedAndRemoved(
        originalLabels,
        labels ?? []
      );

      let organizationId = resource.organization;

      if (addedLabels.length > 0) {
        if (!organizationId) {
          const {
            data: { results },
          } = await OrganizationsAPI.read();
          organizationId = results[0]?.id;
        }
      }

      await Promise.all([
        ...removedCredentials.map(({ id }) =>
          SchedulesAPI.disassociateCredential(scheduleId, id)
        ),
        ...addedCredentials.map(({ id }) =>
          SchedulesAPI.associateCredential(scheduleId, id)
        ),
        ...removedLabels.map((label) =>
          SchedulesAPI.disassociateLabel(scheduleId, label)
        ),
        ...addedLabels.map((label) =>
          SchedulesAPI.associateLabel(scheduleId, label, organizationId ?? null)
        ),
        SchedulesAPI.orderInstanceGroups(
          scheduleId,
          instance_groups ?? [],
          originalInstanceGroups
        ),
      ]);

      navigate(`${pathRoot}schedules/${scheduleId}/details`);
    } catch (err) {
      setFormSubmitError(err);
    }
  };

  return (
    <Card>
      <CardBody>
        <ScheduleForm
          schedule={schedule}
          hasDaysToKeepField={hasDaysToKeepField}
          handleCancel={() =>
            navigate(`${pathRoot}schedules/${schedule.id}/details`)
          }
          handleSubmit={handleSubmit}
          submitError={formSubmitError}
          resource={resource}
          launchConfig={launchConfig}
          surveyConfig={surveyConfig}
          resourceDefaultCredentials={resourceDefaultCredentials}
        />
      </CardBody>
    </Card>
  );
}

export default ScheduleEdit;
