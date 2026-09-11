import type { SurveyConfig, LaunchConfig , SurveyQuestion  } from 'components/LaunchPrompt/types';
import type { Schedule, Untyped } from 'types/api';
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Card } from '@patternfly/react-core';
import * as yaml from 'js-yaml';
import { OrganizationsAPI, SchedulesAPI } from 'api';
import { getAddedAndRemoved } from 'util/lists';
import { parseVariableField } from 'util/yaml';
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
  resource: Untyped;
  launchConfig?: LaunchConfig;
  surveyConfig?: SurveyConfig;
  resourceDefaultCredentials: Untyped;
  [key: string]: unknown;
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
    values: Record<string, unknown>,
    launchConfiguration: Untyped,
    surveyConfiguration: Untyped,
    originalInstanceGroups: Untyped[],
    originalLabels: Untyped[],
    scheduleCredentials = []
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
    } = values as ScheduleFormValues & Record<string, Untyped>;
    // What is left of the form values is the request body, which the handler
    // then adds the derived rrule and extra_data to.
    const submitValues: Record<string, Untyped> = rest;
    let extraVars;
    const surveyValues = getSurveyValues(values);

    if (
      !Object.values(surveyValues).length &&
      surveyConfiguration?.spec?.length
    ) {
      surveyConfiguration.spec.forEach((q: SurveyQuestion) => {
        surveyValues[q.variable] = q.default;
      });
    }

    // Empty string when the launch config does not prompt for variables,
    // which is what mergeExtraVars treats as no overrides.
    const initialExtraVars = launchConfiguration?.ask_variables_on_launch
      ? (values.extra_vars as string) || '---'
      : '';
    if (surveyConfiguration?.spec) {
      extraVars = yaml.dump(mergeExtraVars(initialExtraVars, surveyValues));
    } else {
      extraVars = yaml.dump(mergeExtraVars(initialExtraVars, {}));
    }
    submitValues.extra_data = extraVars && parseVariableField(extraVars);

    if (
      Object.keys(submitValues.extra_data as object).length === 0 &&
      Object.keys((schedule.extra_data ?? {}) as object).length > 0
    ) {
      submitValues.extra_data = schedule.extra_data;
    }
    delete values.extra_vars;
    if (inventory) {
      submitValues.inventory = inventory.id;
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
      const requestData: Record<string, Untyped> = {
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
          if (typeof requestData.extra_data === 'string') {
            requestData.extra_data = JSON.parse(requestData.extra_data);
          }
          requestData.extra_data.days = values.daysToKeep;
        }
      }

      const {
        data: { id: scheduleId },
      } = await SchedulesAPI.update(schedule.id, requestData);

      const { added: addedCredentials, removed: removedCredentials } =
        getAddedAndRemoved(
          [
            ...(resource?.summary_fields.credentials || []),
            ...scheduleCredentials,
          ],
          credentials
        );

      const { added: addedLabels, removed: removedLabels } = getAddedAndRemoved(
        originalLabels,
        labels as Untyped[]
      );

      let organizationId = resource.organization;

      if (addedLabels.length > 0) {
        if (!organizationId) {
          const {
            data: { results },
          } = await OrganizationsAPI.read();
          organizationId = results[0].id;
        }
      }

      await Promise.all([
        ...removedCredentials.map(({ id }) =>
          SchedulesAPI.disassociateCredential(scheduleId, id)
        ),
        ...addedCredentials.map(({ id }) =>
          SchedulesAPI.associateCredential(scheduleId, id)
        ),
        ...removedLabels.map((label: Untyped) =>
          SchedulesAPI.disassociateLabel(scheduleId, label)
        ),
        ...addedLabels.map((label: Untyped) =>
          SchedulesAPI.associateLabel(scheduleId, label, organizationId)
        ),
        SchedulesAPI.orderInstanceGroups(
          scheduleId,
          (instance_groups || []) as Untyped[],
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
