import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Button } from '@patternfly/react-core';
import styled from 'styled-components';
import { useLingui } from '@lingui/react/macro';

import AlertModal from 'components/AlertModal';
import {
  DetailList,
  Detail,
  LaunchedByDetail,
} from 'components/DetailList';
import { CardBody, CardActionsRow } from 'components/Card';
import ChipGroup from 'components/ChipGroup';
import CredentialChip from 'components/CredentialChip';
import DeleteButton from 'components/DeleteButton';
import ErrorDetail from 'components/ErrorDetail';
import { LaunchButton } from 'components/LaunchButton';
import StatusLabel from 'components/StatusLabel';
import JobCancelButton from 'components/JobCancelButton';
import ExecutionEnvironmentDetail from 'components/ExecutionEnvironmentDetail';
import { isJobRunning } from 'util/jobs';
import { formatDateString } from 'util/dates';
import { Job } from 'types';
import { ExecutionEnvironmentBuilderBuildsAPI } from 'api';

const StatusDetailValue = styled.div`
  align-items: center;
  display: inline-grid;
  grid-gap: 10px;
  grid-template-columns: auto auto;
`;

function ExecutionEnvironmentBuilderBuildDetail({ job }) {
  const { t } = useLingui();
  const {
    execution_environment_builder: builder,
    execution_environment: executionEnvironment,
  } = job.summary_fields;
  const [errorMsg, setErrorMsg] = useState();
  const history = useHistory();

  const credential = builder?.summary_fields?.credential;

  const deleteJob = async () => {
    try {
      await ExecutionEnvironmentBuilderBuildsAPI.destroy(job.id);
      history.push('/jobs');
    } catch (err) {
      setErrorMsg(err);
    }
  };

  return (
    <CardBody>
      <DetailList>
        <Detail
          dataCy="job-id"
          label={t`Job ID`}
          value={validateReactNode(job.id)}
        />
        <Detail
          dataCy="job-status"
          fullWidth={Boolean(job.job_explanation)}
          label={t`Status`}
          value={
            <StatusDetailValue>
              {validateReactNode(job.status) ? (
                <StatusLabel status={job.status} />
              ) : (
                t`Unknown Status`
              )}
              {job?.job_explanation && job.job_explanation !== job.status
                ? validateReactNode(job.job_explanation)
                : null}
            </StatusDetailValue>
          }
        />
        <LaunchedByDetail dataCy="job-launched-by" job={job} />
        <Detail
          dataCy="job-started-date"
          label={t`Started`}
          value={
            formatDateString(job.started) || t`Unknown Start Date`
          }
        />
        {job?.finished && (
          <Detail
            dataCy="job-finished-date"
            label={t`Finished`}
            value={
              formatDateString(job.finished) || t`Unknown Finish Date`
            }
          />
        )}
        <ExecutionEnvironmentDetail
        dataCy="job-execution-environment"
        executionEnvironment={executionEnvironment}
        verifyMissingVirtualEnv={false}
        />
        <Detail
          dataCy="execution-environment-name"
          label={t`Environment Name`}
          value={builder?.name || t`Unknown`}
        />
        <Detail
          dataCy="execution-environment-image"
          label={t`Image`}
          value={builder?.image || t`Unknown`}
        />
        <Detail
          dataCy="execution-environment-tag"
          label={t`Tag`}
          value={builder?.tag || ''}
        />
        {credential && (
          <Detail
            dataCy="builder-build-credential"
            label={t`Credential`}
            value={
              <ChipGroup numChips={1} totalChips={1}>
                <CredentialChip
                  credential={credential}
                  isReadOnly
                  ouiaId={`builder-credential-${credential.id}-chip`}
                />
              </ChipGroup>
            }
          />
        )}
      </DetailList>
      <CardActionsRow>
        {job.summary_fields.user_capabilities.start && (
          <LaunchButton resource={job}>
            {({ handleRelaunch, isLaunching }) => (
              <Button
                ouiaId="builder-build-detail-relaunch-button"
                type="submit"
                onClick={() => handleRelaunch()}
                isDisabled={isLaunching}
              >
                {t`Relaunch`}
              </Button>
            )}
          </LaunchButton>
        )}
        {isJobRunning(job.status) &&
          job?.summary_fields?.user_capabilities?.start && (
            <JobCancelButton
              job={job}
              errorTitle={t`Build Cancel Error`}
              title={t`Cancel Build`}
              errorMessage={t`Failed to cancel build`}
            />
          )}
        {!isJobRunning(job.status) &&
          job?.summary_fields?.user_capabilities?.delete && (
            <DeleteButton
              name={job.name}
              modalTitle={t`Delete Build`}
              onConfirm={deleteJob}
              ouiaId="builder-build-detail-delete-button"
            >
              {t`Delete`}
            </DeleteButton>
          )}
      </CardActionsRow>
      {errorMsg && (
        <AlertModal
          isOpen={errorMsg}
          variant="error"
          onClose={() => setErrorMsg()}
          title={t`Build Delete Error`}
        >
          <ErrorDetail error={errorMsg} />
        </AlertModal>
      )}
    </CardBody>
  );
}

ExecutionEnvironmentBuilderBuildDetail.propTypes = {
  job: Job.isRequired,
};

export default ExecutionEnvironmentBuilderBuildDetail;

function validateReactNode(value) {
  if (value === null || value === undefined) return 'Unknown';
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}
