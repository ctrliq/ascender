import type { SchedulesApiModel, Untyped } from 'types/api';
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Card } from '@patternfly/react-core';
import * as yaml from 'js-yaml';
import { parseVariableField } from 'util/yaml';
import { OrganizationsAPI, SchedulesAPI } from 'api';
import mergeExtraVars from 'util/prompt/mergeExtraVars';
import getSurveyValues from 'util/prompt/getSurveyValues';
import { getAddedAndRemoved } from 'util/lists';
import type {
  LaunchConfig,
  SurveyConfig,
  SurveyQuestion,
} from 'components/LaunchPrompt/types';
import ScheduleForm from '../shared/ScheduleForm';
import buildRuleSet from '../shared/buildRuleSet';
import { CardBody } from '../../Card';
import type { ScheduleFormValues } from '../shared/types';

export interface ScheduleAddProps {
  resource: Untyped;
  apiModel: SchedulesApiModel;
  launchConfig?: LaunchConfig;
  surveyConfig?: SurveyConfig;
  hasDaysToKeepField?: boolean;
  resourceDefaultCredentials?: Untyped;
  [key: string]: unknown;
}

function ScheduleAdd({
  resource,
  apiModel,
  launchConfig,
  surveyConfig,
  hasDaysToKeepField,
  resourceDefaultCredentials,
}: ScheduleAddProps) {
  const [formSubmitError, setFormSubmitError] = useState<unknown>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
  const pathRoot = pathname.substr(0, pathname.indexOf('schedules'));

  const handleSubmit = async (
    values: ScheduleFormValues,
    launchConfiguration: LaunchConfig,
    surveyConfiguration: SurveyConfig
  ) => {
    const {
      execution_environment,
      instance_groups,
      inventory,
      frequency,
      frequencyOptions,
      exceptionFrequency,
      exceptionOptions,
      timezone,
      credentials,
      labels,
      ...rest
    } = values as ScheduleFormValues & Record<string, Untyped>;
    // What is left of the form values is the request body, which the handler
    // then adds the derived rrule and extra_data to.
    const submitValues: Record<string, Untyped> = rest;
    const { added } = getAddedAndRemoved(
      resource?.summary_fields.credentials,
      credentials
    );
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
    delete values.extra_vars;
    if (inventory) {
      submitValues.inventory = inventory.id;
    }

    if (execution_environment) {
      submitValues.execution_environment = execution_environment.id;
    }

    try {
      const ruleSet = buildRuleSet(values);
      const requestData: Record<string, Untyped> = {
        ...submitValues,
        rrule: ruleSet.toString().replace(/\n/g, ' '),
      };
      delete requestData.startDate;
      delete requestData.startTime;

      if (Object.keys(values).includes('daysToKeep')) {
        if (requestData.extra_data) {
          requestData.extra_data.days = values.daysToKeep;
        } else {
          requestData.extra_data = JSON.stringify({
            days: values.daysToKeep,
          });
        }
      }

      const {
        data: { id: scheduleId },
      } = await apiModel.createSchedule(resource.id, requestData);

      let labelsPromises = [];
      let credentialsPromises: Promise<unknown>[] = [];

      if (launchConfiguration?.ask_labels_on_launch && labels) {
        let organizationId = resource.organization;
        if (!organizationId) {
          // eslint-disable-next-line no-useless-catch
          try {
            const {
              data: { results },
            } = await OrganizationsAPI.read();
            organizationId = results[0].id;
          } catch (err) {
            throw err;
          }
        }

        labelsPromises = labels.map((label: Untyped) =>
          SchedulesAPI.associateLabel(scheduleId, label, organizationId)
        );
      }

      if (launchConfiguration?.ask_credential_on_launch && added?.length > 0) {
        credentialsPromises = added.map(({ id: credentialId }) =>
          SchedulesAPI.associateCredential(scheduleId, credentialId)
        );
      }
      await Promise.all([labelsPromises, credentialsPromises]);

      if (
        launchConfiguration?.ask_instance_groups_on_launch &&
        instance_groups
      ) {
        /* eslint-disable no-await-in-loop, no-restricted-syntax */
        for (const group of instance_groups) {
          await SchedulesAPI.associateInstanceGroup(scheduleId, group.id);
        }
      }

      navigate(`${pathRoot}schedules/${scheduleId}`);
    } catch (err) {
      setFormSubmitError(err);
    }
  };

  return (
    <Card>
      <CardBody>
        <ScheduleForm
          hasDaysToKeepField={hasDaysToKeepField}
          handleCancel={() => navigate(`${pathRoot}schedules`)}
          handleSubmit={handleSubmit}
          submitError={formSubmitError}
          launchConfig={launchConfig}
          surveyConfig={surveyConfig}
          resource={resource}
          resourceDefaultCredentials={resourceDefaultCredentials}
        />
      </CardBody>
    </Card>
  );
}

export default ScheduleAdd;
