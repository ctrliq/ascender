import 'styled-components/macro';
import React, { useCallback, useEffect } from 'react';
import { Link, useHistory, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Chip, Divider, Title, Button } from '@patternfly/react-core';
import { Schedule } from 'types';
import { formatDateString } from 'util/dates';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { JobTemplatesAPI, SchedulesAPI, WorkflowJobTemplatesAPI } from 'api';
import { parseVariableField, jsonToYaml } from 'util/yaml';
import { useConfig } from 'contexts/Config';
import InstanceGroupLabels from 'components/InstanceGroupLabels';
import parseRuleObj, { UnsupportedRRuleError } from '../shared/parseRuleObj';
import UnsupportedRRuleAlert from '../shared/UnsupportedRRuleAlert';
import FrequencyDetails from './FrequencyDetails';
import AlertModal from '../../AlertModal';
import { CardBody, CardActionsRow } from '../../Card';
import ContentError from '../../ContentError';
import ContentLoading from '../../ContentLoading';
import CredentialChip from '../../CredentialChip';
import { DetailList, Detail, UserDateDetail } from '../../DetailList';
import ScheduleOccurrences from '../ScheduleOccurrences';
import ScheduleToggle from '../ScheduleToggle';
import DeleteButton from '../../DeleteButton';
import ErrorDetail from '../../ErrorDetail';
import ChipGroup from '../../ChipGroup';
import { VariablesDetail } from '../../CodeEditor';
import { VERBOSITY } from '../../VerbositySelectField';
import getHelpText from '../../../screens/Template/shared/JobTemplate.helptext';

const PromptDivider = styled(Divider)`
  margin-top: var(--pf-global--spacer--lg);
  margin-bottom: var(--pf-global--spacer--lg);
`;

const PromptTitle = styled(Title)`
  margin-top: 40px;
  --pf-c-title--m-md--FontWeight: 700;
  grid-column: 1 / -1;
`;

const PromptDetailList = styled(DetailList)`
  padding: 0px 20px;
`;

const FrequencyDetailsContainer = styled.div`
  background-color: var(--pf-global--palette--black-150);
  margin-top: var(--pf-global--spacer--lg);
  margin-bottom: var(--pf-global--spacer--lg);
  margin-right: calc(var(--pf-c-card--child--PaddingRight) * -1);
  margin-left: calc(var(--pf-c-card--child--PaddingLeft) * -1);
  padding: var(--pf-c-card--child--PaddingRight);

  & > p {
    margin-bottom: var(--pf-global--spacer--md);
  }

  & > *:not(:first-child):not(:last-child) {
    margin-bottom: var(--pf-global--spacer--md);
    padding-bottom: var(--pf-global--spacer--md);
    border-bottom: 1px solid var(--pf-global--palette--black-300);
  }

  & + & {
    margin-top: calc(var(--pf-global--spacer--lg) * -1);
  }
`;

function ScheduleDetail({ hasDaysToKeepField, schedule, surveyConfig }) {
  const { i18n } = useLingui();
  const {
    id,
    created,
    description,
    diff_mode,
    dtend,
    dtstart,
    execution_environment,
    extra_data,
    forks,
    inventory,
    job_slice_count,
    job_tags,
    job_type,
    limit,
    modified,
    name,
    next_run,
    rrule,
    scm_branch,
    skip_tags,
    summary_fields,
    timeout,
    timezone,
    verbosity,
  } = schedule;
  const helpText = getHelpText(i18n);
  const history = useHistory();
  const { pathname } = useLocation();
  const pathRoot = pathname.substr(0, pathname.indexOf('schedules'));
  const config = useConfig();

  const {
    request: deleteSchedule,
    isLoading: isDeleteLoading,
    error: deleteError,
  } = useRequest(
    useCallback(async () => {
      await SchedulesAPI.destroy(id);
      history.push(`${pathRoot}schedules`);
    }, [id, history, pathRoot])
  );

  const { error, dismissError } = useDismissableError(deleteError);

  const {
    result: [credentials, preview, launchData, labels, instanceGroups],
    isLoading,
    error: readContentError,
    request: fetchCredentialsAndPreview,
  } = useRequest(
    useCallback(async () => {
      const promises = [
        SchedulesAPI.readCredentials(id),
        SchedulesAPI.createPreview({
          rrule,
        }),
      ];

      if (
        schedule?.summary_fields?.unified_job_template?.unified_job_type ===
        'job'
      ) {
        promises.push(
          JobTemplatesAPI.readLaunch(
            schedule.summary_fields.unified_job_template.id
          ),
          SchedulesAPI.readAllLabels(id),
          SchedulesAPI.readInstanceGroups(id)
        );
      } else if (
        schedule?.summary_fields?.unified_job_template?.unified_job_type ===
        'workflow_job'
      ) {
        promises.push(
          WorkflowJobTemplatesAPI.readLaunch(
            schedule.summary_fields.unified_job_template.id
          ),
          SchedulesAPI.readAllLabels(id)
        );
      } else {
        promises.push(Promise.resolve());
      }

      const [
        { data },
        { data: schedulePreview },
        launch,
        allLabelsResults,
        instanceGroupsResults,
      ] = await Promise.all(promises);

      return [
        data.results,
        schedulePreview,
        launch?.data,
        allLabelsResults?.data?.results,
        instanceGroupsResults?.data?.results,
      ];
    }, [id, schedule, rrule]),
    []
  );

  useEffect(() => {
    fetchCredentialsAndPreview();
  }, [fetchCredentialsAndPreview]);

  const frequencies = {
    minute: i18n._(msg`Minute`),
    hour: i18n._(msg`Hour`),
    day: i18n._(msg`Day`),
    week: i18n._(msg`Week`),
    month: i18n._(msg`Month`),
    year: i18n._(msg`Year`),
  };
  let rruleError;
  let frequency = [];
  let frequencyOptions = {};
  let exceptionFrequency = [];
  let exceptionOptions = {};
  try {
    ({ frequency, frequencyOptions, exceptionFrequency, exceptionOptions } =
      parseRuleObj(schedule));
  } catch (parseRuleError) {
    if (parseRuleError instanceof UnsupportedRRuleError) {
      rruleError = parseRuleError;
    }
  }

  const repeatFrequency = frequency.length
    ? frequency.map((f) => frequencies[f]).join(', ')
    : i18n._(msg`None (Run Once)`);
  const exceptionRepeatFrequency = exceptionFrequency.length
    ? exceptionFrequency.map((f) => frequencies[f]).join(', ')
    : i18n._(msg`None (Run Once)`);

  const {
    ask_credential_on_launch,
    inventory_needed_to_start,
    ask_diff_mode_on_launch,
    ask_inventory_on_launch,
    ask_job_type_on_launch,
    ask_limit_on_launch,
    ask_scm_branch_on_launch,
    ask_skip_tags_on_launch,
    ask_tags_on_launch,
    ask_variables_on_launch,
    ask_verbosity_on_launch,
    ask_execution_environment_on_launch,
    ask_labels_on_launch,
    ask_forks_on_launch,
    ask_job_slice_count_on_launch,
    ask_timeout_on_launch,
    ask_instance_groups_on_launch,
    survey_enabled,
  } = launchData || {};

  const missingRequiredInventory = () => {
    if (!inventory_needed_to_start || schedule?.summary_fields?.inventory?.id) {
      return false;
    }
    return true;
  };

  const hasMissingSurveyValue = () => {
    let missingValues = false;
    if (survey_enabled) {
      surveyConfig.spec.forEach((question) => {
        const hasDefaultValue = Boolean(question.default);
        if (question.required && !hasDefaultValue) {
          const extraDataKeys = Object.keys(schedule?.extra_data);

          const hasMatchingKey = extraDataKeys.includes(question.variable);
          Object.values(schedule?.extra_data).forEach((value) => {
            if (!value || !hasMatchingKey) {
              missingValues = true;
            } else {
              missingValues = false;
            }
          });
          if (!Object.values(schedule.extra_data).length) {
            missingValues = true;
          }
        }
      });
    }
    return missingValues;
  };
  const isDisabled = Boolean(
    missingRequiredInventory() || hasMissingSurveyValue()
  );

  const showCredentialsDetail =
    ask_credential_on_launch && credentials.length > 0;
  const showInventoryDetail = ask_inventory_on_launch && inventory;
  const showVariablesDetail =
    (ask_variables_on_launch || survey_enabled) &&
    ((typeof extra_data === 'string' && extra_data !== '') ||
      (typeof extra_data === 'object' && Object.keys(extra_data).length > 0));
  const showTagsDetail = ask_tags_on_launch && job_tags && job_tags.length > 0;
  const showSkipTagsDetail =
    ask_skip_tags_on_launch && skip_tags && skip_tags.length > 0;
  const showDiffModeDetail =
    ask_diff_mode_on_launch && typeof diff_mode === 'boolean';
  const showLimitDetail = ask_limit_on_launch && limit;
  const showJobTypeDetail = ask_job_type_on_launch && job_type;
  const showSCMBranchDetail = ask_scm_branch_on_launch && scm_branch;
  const showVerbosityDetail =
    ask_verbosity_on_launch && VERBOSITY(i18n)[verbosity];
  const showExecutionEnvironmentDetail =
    ask_execution_environment_on_launch && execution_environment;
  const showLabelsDetail = ask_labels_on_launch && labels && labels.length > 0;
  const showForksDetail = ask_forks_on_launch && typeof forks === 'number';
  const showJobSlicingDetail =
    ask_job_slice_count_on_launch && typeof job_slice_count === 'number';
  const showTimeoutDetail =
    ask_timeout_on_launch && typeof timeout === 'number';
  const showInstanceGroupsDetail =
    ask_instance_groups_on_launch && instanceGroups.length > 0;

  const showPromptedFields =
    showCredentialsDetail ||
    showDiffModeDetail ||
    showInventoryDetail ||
    showJobTypeDetail ||
    showLimitDetail ||
    showSCMBranchDetail ||
    showSkipTagsDetail ||
    showTagsDetail ||
    showVerbosityDetail ||
    showVariablesDetail ||
    showExecutionEnvironmentDetail ||
    showLabelsDetail ||
    showForksDetail ||
    showJobSlicingDetail ||
    showTimeoutDetail ||
    showInstanceGroupsDetail;

  if (isLoading) {
    return <ContentLoading />;
  }

  if (readContentError) {
    return <ContentError error={readContentError} />;
  }

  let daysToKeep = null;
  if (hasDaysToKeepField && extra_data) {
    if (typeof extra_data === 'string' && extra_data !== '') {
      daysToKeep = parseVariableField(extra_data).days;
    }
    if (typeof extra_data === 'object') {
      daysToKeep = extra_data?.days;
    }
  }

  return (
    <CardBody>
      <ScheduleToggle
        schedule={schedule}
        css="padding-bottom: 40px"
        isDisabled={isDisabled}
      />
      <DetailList gutter="sm">
        <Detail label={i18n._(msg`Name`)} value={name} dataCy="schedule-name" />
        <Detail
          label={i18n._(msg`Description`)}
          value={description}
          dataCy="schedule-description"
        />
        <Detail
          label={i18n._(msg`First Run`)}
          value={formatDateString(dtstart, timezone)}
          dataCy="schedule-first-run"
        />
        <Detail
          label={i18n._(msg`Next Run`)}
          value={formatDateString(next_run, timezone)}
          dataCy="schedule-next-run"
        />
        <Detail
          label={i18n._(msg`Last Run`)}
          value={formatDateString(dtend, timezone)}
        />
        <Detail
          label={i18n._(msg`Local Time Zone`)}
          value={timezone}
          helpText={helpText.localTimeZone(config)}
          dataCy="schedule-timezone"
        />
        <Detail
          label={i18n._(msg`Repeat Frequency`)}
          value={repeatFrequency}
          dataCy="schedule-repeat-frequency"
        />
        <Detail
          label={i18n._(msg`Exception Frequency`)}
          value={exceptionRepeatFrequency}
          dataCy="schedule-exception-frequency"
        />
      </DetailList>
      {frequency.length ? (
        <FrequencyDetailsContainer>
          <div ouia-component-id="schedule-frequency-details">
            <p>
              <strong>{i18n._(msg`Frequency Details`)}</strong>
            </p>
            {frequency.map((freq) => (
              <FrequencyDetails
                key={freq}
                type={freq}
                label={frequencies[freq]}
                options={frequencyOptions[freq]}
                timezone={timezone}
              />
            ))}
          </div>
        </FrequencyDetailsContainer>
      ) : null}
      {exceptionFrequency.length ? (
        <FrequencyDetailsContainer>
          <div ouia-component-id="schedule-exception-details">
            <p css="border-top: 0">
              <strong>{i18n._(msg`Frequency Exception Details`)}</strong>
            </p>
            {exceptionFrequency.map((freq) => (
              <FrequencyDetails
                key={freq}
                type={freq}
                label={frequencies[freq]}
                options={exceptionOptions[freq]}
                timezone={timezone}
                isException
              />
            ))}
          </div>
        </FrequencyDetailsContainer>
      ) : null}
      <DetailList gutter="sm">
        {hasDaysToKeepField ? (
          <Detail
            label={i18n._(msg`Days of Data to Keep`)}
            value={daysToKeep}
            dataCy="schedule-days-to-keep"
          />
        ) : null}
        <ScheduleOccurrences preview={preview} tz={timezone} />
        <UserDateDetail
          label={i18n._(msg`Created`)}
          date={created}
          user={summary_fields.created_by}
        />
        <UserDateDetail
          label={i18n._(msg`Last Modified`)}
          date={modified}
          user={summary_fields.modified_by}
        />
      </DetailList>
      {showPromptedFields && (
        <>
          <PromptTitle headingLevel="h2">
            {i18n._(msg`Prompted Values`)}
          </PromptTitle>
          <PromptDivider />
          <PromptDetailList>
            {ask_job_type_on_launch && (
              <Detail
                label={i18n._(msg`Job Type`)}
                value={job_type}
                dataCy="shedule-job-type"
              />
            )}
            {showInventoryDetail && (
              <Detail
                label={i18n._(msg`Inventory`)}
                value={
                  summary_fields?.inventory ? (
                    <Link
                      to={`/inventories/${
                        summary_fields?.inventory?.kind === 'smart'
                          ? 'smart_inventory'
                          : 'inventory'
                      }/${summary_fields?.inventory?.id}/details`}
                    >
                      {summary_fields?.inventory?.name}
                    </Link>
                  ) : (
                    ' '
                  )
                }
                dataCy="schedule-inventory"
              />
            )}
            {showExecutionEnvironmentDetail && (
              <Detail
                label={i18n._(msg`Execution Environment`)}
                value={
                  summary_fields?.execution_environment ? (
                    <Link
                      to={`/execution_environments/${summary_fields?.execution_environment?.id}/details`}
                    >
                      {summary_fields?.execution_environment?.name}
                    </Link>
                  ) : (
                    ' '
                  )
                }
              />
            )}
            {ask_scm_branch_on_launch && (
              <Detail
                label={i18n._(msg`Source Control Branch`)}
                value={scm_branch}
                dataCy="schedule-scm-branch"
              />
            )}
            {ask_limit_on_launch && (
              <Detail
                label={i18n._(msg`Limit`)}
                value={limit}
                dataCy="schedule-limit"
              />
            )}
            {ask_forks_on_launch && (
              <Detail label={i18n._(msg`Forks`)} value={forks} />
            )}
            {ask_verbosity_on_launch && (
              <Detail
                label={i18n._(msg`Verbosity`)}
                value={VERBOSITY(i18n)[verbosity]}
                dataCy="schedule-verbosity"
              />
            )}
            {ask_timeout_on_launch && (
              <Detail label={i18n._(msg`Timeout`)} value={timeout} />
            )}
            {showDiffModeDetail && (
              <Detail
                label={i18n._(msg`Show Changes`)}
                value={diff_mode ? i18n._(msg`On`) : i18n._(msg`Off`)}
                dataCy="schedule-show-changes"
              />
            )}
            {ask_job_slice_count_on_launch && (
              <Detail
                label={i18n._(msg`Job Slicing`)}
                value={job_slice_count}
              />
            )}
            {showInstanceGroupsDetail && (
              <Detail
                fullWidth
                label={i18n._(msg`Instance Groups`)}
                value={
                  <InstanceGroupLabels labels={instanceGroups} isLinkable />
                }
                isEmpty={instanceGroups.length === 0}
              />
            )}
            {showCredentialsDetail && (
              <Detail
                fullWidth
                label={i18n._(msg`Credentials`)}
                value={
                  <ChipGroup
                    numChips={5}
                    totalChips={credentials.length}
                    ouiaId="schedule-credential-chips"
                  >
                    {credentials.map((c) => (
                      <CredentialChip
                        key={c.id}
                        credential={c}
                        isReadOnly
                        ouiaId={`credential-${c.id}-chip`}
                      />
                    ))}
                  </ChipGroup>
                }
                dataCy="schedule-credentials"
              />
            )}
            {showLabelsDetail && (
              <Detail
                fullWidth
                label={i18n._(msg`Labels`)}
                value={
                  <ChipGroup
                    numChips={5}
                    totalChips={labels.length}
                    ouiaId="schedule-label-chips"
                  >
                    {labels.map((l) => (
                      <Chip key={l.id} ouiaId={`label-${l.id}-chip`} isReadOnly>
                        {l.name}
                      </Chip>
                    ))}
                  </ChipGroup>
                }
                isEmpty={labels.length === 0}
              />
            )}
            {showTagsDetail && (
              <Detail
                fullWidth
                label={i18n._(msg`Job Tags`)}
                value={
                  <ChipGroup
                    numChips={5}
                    totalChips={job_tags.split(',').length}
                    ouiaId="schedule-job-tag-chips"
                  >
                    {job_tags.split(',').map((jobTag) => (
                      <Chip
                        key={jobTag}
                        isReadOnly
                        ouiaId={`job-tag-${jobTag}-chip`}
                      >
                        {jobTag}
                      </Chip>
                    ))}
                  </ChipGroup>
                }
                dataCy="schedule-job-tags"
              />
            )}
            {showSkipTagsDetail && (
              <Detail
                fullWidth
                label={i18n._(msg`Skip Tags`)}
                value={
                  <ChipGroup
                    numChips={5}
                    totalChips={skip_tags.split(',').length}
                    ouiaId="schedule-skip-tag-chips"
                  >
                    {skip_tags.split(',').map((skipTag) => (
                      <Chip
                        key={skipTag}
                        isReadOnly
                        ouiaId={`skip-tag-${skipTag}-chip`}
                      >
                        {skipTag}
                      </Chip>
                    ))}
                  </ChipGroup>
                }
                dataCy="schedule-skip-tags"
              />
            )}
            {showVariablesDetail && (
              <VariablesDetail
                value={jsonToYaml(JSON.stringify(extra_data))}
                rows={4}
                label={i18n._(msg`Variables`)}
                name="extra_vars"
                dataCy="schedule-detail-variables"
              />
            )}
          </PromptDetailList>
        </>
      )}
      {rruleError && <UnsupportedRRuleAlert schedule={schedule} />}
      <CardActionsRow>
        {summary_fields?.user_capabilities?.edit && (
          <Button
            ouiaId="schedule-detail-edit-button"
            aria-label={i18n._(msg`Edit`)}
            component={Link}
            to={pathname.replace('details', 'edit')}
          >
            {i18n._(msg`Edit`)}
          </Button>
        )}
        {summary_fields?.user_capabilities?.delete && (
          <DeleteButton
            name={name}
            modalTitle={i18n._(msg`Delete Schedule`)}
            onConfirm={deleteSchedule}
            isDisabled={isDeleteLoading}
          >
            {i18n._(msg`Delete`)}
          </DeleteButton>
        )}
      </CardActionsRow>
      {error && (
        <AlertModal
          isOpen={error}
          variant="error"
          title={i18n._(msg`Error!`)}
          onClose={dismissError}
        >
          {i18n._(msg`Failed to delete schedule.`)}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </CardBody>
  );
}

ScheduleDetail.propTypes = {
  schedule: Schedule.isRequired,
};

export default ScheduleDetail;
