import type { AnyJob, SummaryFields } from 'types/api';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Label } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';

import AlertModal from 'components/AlertModal';
import {
  DeletedDetail,
  Detail,
  DetailList,
  LaunchedByDetail,
  UserDateDetail,
} from 'components/DetailList';
import { CardBody, CardActionsRow } from 'components/Card';
import DeleteButton from 'components/DeleteButton';
import ErrorDetail from 'components/ErrorDetail';
import { LaunchButton } from 'components/LaunchButton';
import StatusLabel from 'components/StatusLabel';
import JobCancelButton from 'components/JobCancelButton';
import ExecutionEnvironmentDetail from 'components/ExecutionEnvironmentDetail';
import { ExecutionEnvironmentBuilderBuildsAPI } from 'api';
import { canOfferCancel, isJobRunning } from 'util/jobs';
import { formatDateString } from 'util/dates';
import '../JobDetail/JobDetail.css';

export interface ExecutionEnvironmentBuilderBuildDetailProps {
  job: AnyJob;
  [key: string]: unknown;
}

/**
 * The details of one execution environment build.
 *
 * A build is a job of its own kind: it has no template, inventory or playbook
 * of the user's to show, only the builder it ran and what that builder builds
 * from and pushes as, so it gets this screen rather than the general one.
 */
function ExecutionEnvironmentBuilderBuildDetail({
  job,
}: ExecutionEnvironmentBuilderBuildDetailProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState<unknown>();
  const {
    created_by: createdBy,
    credential,
    execution_environment: executionEnvironment,
    execution_environment_builder: builder,
    instance_group: instanceGroup,
    project,
    source_project_update: sourceProjectUpdate,
  } = job.summary_fields ?? ({} as SummaryFields);

  const deleteBuild = async () => {
    try {
      await ExecutionEnvironmentBuilderBuildsAPI.destroy(job.id);
      navigate('/jobs');
    } catch (err) {
      setErrorMsg(err);
    }
  };

  return (
    <CardBody>
      <DetailList>
        <Detail dataCy="job-id" label={t`Job ID`} value={job.id} />
        <Detail
          dataCy="job-status"
          fullWidth={Boolean(job.job_explanation)}
          label={t`Status`}
          value={
            <div className="ascender-job-detail__status-detail-value">
              <StatusLabel status={job.status} />
              {job.job_explanation && job.job_explanation !== job.status
                ? job.job_explanation
                : null}
            </div>
          }
        />
        <Detail
          dataCy="job-started-date"
          label={t`Started`}
          value={formatDateString(job.started) || t`Unknown Start Date`}
        />
        {job.finished && (
          <Detail
            dataCy="job-finished-date"
            label={t`Finished`}
            value={formatDateString(job.finished) || t`Unknown Finish Date`}
          />
        )}
        <Detail
          dataCy="job-type"
          label={t`Job Type`}
          value={t`Execution Environment Build`}
        />
        <LaunchedByDetail dataCy="job-launched-by" job={job} />
        {builder ? (
          <Detail
            dataCy="build-builder"
            label={t`Execution Environment Builder`}
            value={
              <Link
                to={`/execution_environment_builders/${builder.id}/details`}
              >
                {builder.name}
              </Link>
            }
          />
        ) : (
          <DeletedDetail label={t`Execution Environment Builder`} />
        )}
        <Detail
          dataCy="build-image"
          label={t`Image`}
          value={
            builder?.image ? `${builder.image}:${builder.tag ?? ''}` : null
          }
        />
        {project ? (
          <Detail
            dataCy="build-project"
            label={t`Project`}
            value={
              <Link to={`/projects/${project.id}/details`}>{project.name}</Link>
            }
          />
        ) : (
          <DeletedDetail label={t`Project`} />
        )}
        <Detail
          dataCy="build-execution-environment-file"
          label={t`Execution Environment File`}
          value={builder?.execution_environment_file}
        />
        {sourceProjectUpdate && (
          <Detail
            dataCy="build-project-update-status"
            label={t`Project Update Status`}
            value={
              <Link to={`/jobs/project/${sourceProjectUpdate.id}`}>
                <StatusLabel status={sourceProjectUpdate.status} />
              </Link>
            }
          />
        )}
        <Detail
          dataCy="build-scm-revision"
          label={t`Revision`}
          value={job.scm_revision}
        />
        {credential && (
          <Detail
            dataCy="build-registry-credential"
            label={t`Registry credential`}
            value={
              <Label variant="outline" color="blue">
                {credential.name}
              </Label>
            }
          />
        )}
        {!isJobRunning(job.status) && (
          <ExecutionEnvironmentDetail
            dataCy="job-execution-environment"
            executionEnvironment={executionEnvironment}
            verifyMissingVirtualEnv={false}
          />
        )}
        <Detail
          dataCy="job-execution-node"
          label={t`Execution Node`}
          value={job.execution_node}
        />
        {instanceGroup && (
          <Detail
            dataCy="job-instance-group"
            label={t`Instance Group`}
            value={
              <Link to={`/instance_groups/${instanceGroup.id}`}>
                {instanceGroup.name}
              </Link>
            }
          />
        )}
        <UserDateDetail
          label={t`Created`}
          date={job.created}
          user={createdBy}
        />
        <UserDateDetail label={t`Last Modified`} date={job.modified} />
      </DetailList>
      <CardActionsRow>
        {job.summary_fields?.user_capabilities?.start && (
          <LaunchButton resource={job} aria-label={t`Relaunch`}>
            {({ handleRelaunch, isLaunching }) => (
              <Button
                ouiaId="build-detail-relaunch-button"
                type="submit"
                onClick={() => handleRelaunch()}
                isDisabled={isLaunching}
              >
                {t`Relaunch`}
              </Button>
            )}
          </LaunchButton>
        )}
        {isJobRunning(job.status) && canOfferCancel(job) && (
          <JobCancelButton
            job={job}
            errorTitle={t`Job Cancel Error`}
            title={t`Cancel ${job.name}`}
            errorMessage={t`Failed to cancel ${job.name}`}
          />
        )}
        {!isJobRunning(job.status) &&
          job.summary_fields?.user_capabilities?.delete && (
            <DeleteButton
              name={job.name}
              modalTitle={t`Delete Job`}
              onConfirm={deleteBuild}
              ouiaId="build-detail-delete-button"
            >
              {t`Delete`}
            </DeleteButton>
          )}
      </CardActionsRow>
      {Boolean(errorMsg) && (
        <AlertModal
          isOpen={Boolean(errorMsg)}
          variant="error"
          onClose={() => setErrorMsg(undefined)}
          title={t`Job Delete Error`}
        >
          <ErrorDetail error={errorMsg} />
        </AlertModal>
      )}
    </CardBody>
  );
}

export default ExecutionEnvironmentBuilderBuildDetail;
