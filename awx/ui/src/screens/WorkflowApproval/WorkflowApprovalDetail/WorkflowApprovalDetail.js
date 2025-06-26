import React, { useCallback, useEffect } from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Link, useHistory, useParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  Divider as PFDivider,
  Title as PFTitle,
  Chip,
} from '@patternfly/react-core';
import AlertModal from 'components/AlertModal';
import ChipGroup from 'components/ChipGroup';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import DeleteButton from 'components/DeleteButton';
import ErrorDetail from 'components/ErrorDetail';
import { CardBody, CardActionsRow } from 'components/Card';
import { Detail, DetailList, UserDateDetail } from 'components/DetailList';
import { VariablesDetail } from 'components/CodeEditor';
import { formatDateString, secondsToHHMMSS } from 'util/dates';
import { WorkflowApprovalsAPI, WorkflowJobsAPI } from 'api';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { WorkflowApproval } from 'types';
import StatusLabel from 'components/StatusLabel';
import JobCancelButton from 'components/JobCancelButton';
import useToast, { AlertVariant } from 'hooks/useToast';
import WorkflowApprovalButton from '../shared/WorkflowApprovalButton';
import WorkflowDenyButton from '../shared/WorkflowDenyButton';
import {
  getDetailPendingLabel,
  getStatus,
} from '../shared/WorkflowApprovalUtils';

const Divider = styled(PFDivider)`
  margin-top: var(--pf-global--spacer--lg);
  margin-bottom: var(--pf-global--spacer--lg);
`;

const Title = styled(PFTitle)`
  margin-top: var(--pf-global--spacer--xl);
  --pf-c-title--m-md--FontWeight: 700;
`;

const WFDetailList = styled(DetailList)`
  padding: 0px var(--pf-global--spacer--lg);
`;

function WorkflowApprovalDetail({ workflowApproval, fetchWorkflowApproval }) {
  const { i18n } = useLingui();
  const { id: workflowApprovalId } = useParams();
  const history = useHistory();
  const { addToast, Toast, toastProps } = useToast();

  const {
    request: deleteWorkflowApproval,
    isLoading: isDeleteLoading,
    error: deleteApprovalError,
  } = useRequest(
    useCallback(async () => {
      await WorkflowApprovalsAPI.destroy(workflowApprovalId);
      history.push(`/workflow_approvals`);
    }, [workflowApprovalId, history])
  );

  const { error: deleteError, dismissError: dismissDeleteError } =
    useDismissableError(deleteApprovalError);

  const sourceWorkflowJob =
    workflowApproval?.summary_fields?.source_workflow_job;
  const sourceWorkflowJobTemplate =
    workflowApproval?.summary_fields?.workflow_job_template;

  const {
    error: fetchWorkflowJobError,
    isLoading: isLoadingWorkflowJob,
    request: fetchWorkflowJob,
    result: workflowJob,
  } = useRequest(
    useCallback(async () => {
      if (!sourceWorkflowJob?.id) return {};
      const { data } = await WorkflowJobsAPI.readDetail(sourceWorkflowJob?.id);
      return data;
    }, [sourceWorkflowJob?.id]),
    {
      workflowJob: null,
      isLoading: true,
    }
  );

  useEffect(() => {
    fetchWorkflowJob();
  }, [fetchWorkflowJob]);

  const handleToast = useCallback(
    (id, title) => {
      addToast({
        id,
        title,
        variant: AlertVariant.success,
        hasTimeout: true,
      });
      fetchWorkflowApproval();
    },
    [addToast, fetchWorkflowApproval]
  );

  const isLoading = isDeleteLoading || isLoadingWorkflowJob;

  if (isLoadingWorkflowJob) {
    return <ContentLoading />;
  }
  if (fetchWorkflowJobError) {
    return <ContentError error={fetchWorkflowJobError} />;
  }
  const showDeleteButton =
    workflowApproval.status !== 'pending' &&
    workflowApproval.summary_fields?.user_capabilities?.delete;
  return (
    <CardBody>
      <DetailList gutter="sm">
        <Detail
          label={i18n._(msg`Name`)}
          value={workflowApproval.name}
          dataCy="wa-detail-name"
        />
        <Detail
          label={i18n._(msg`Description`)}
          value={workflowApproval.description}
          dataCy="wa-detail-description"
        />
        {workflowApproval.status === 'pending' && (
          <Detail
            label={i18n._(msg`Expires`)}
            value={
              <StatusLabel status={workflowApproval.status}>
                {getDetailPendingLabel(workflowApproval, i18n)}
              </StatusLabel>
            }
            dataCy="wa-detail-expires"
          />
        )}
        {workflowApproval.status !== 'pending' && (
          <Detail
            label={i18n._(msg`Status`)}
            value={<StatusLabel status={getStatus(workflowApproval, i18n)} />}
            dataCy="wa-detail-status"
          />
        )}
        {workflowApproval.summary_fields.approved_or_denied_by && (
          <Detail
            label={i18n._(msg`Actor`)}
            value={
              <Link
                to={`/users/${workflowApproval.summary_fields.approved_or_denied_by.id}`}
              >
                {workflowApproval.summary_fields.approved_or_denied_by.username}
              </Link>
            }
            dataCy="wa-detail-actor"
          />
        )}
        <Detail
          label={i18n._(msg`Explanation`)}
          value={workflowApproval.job_explanation}
          dataCy="wa-detail-explanation"
        />
        <Detail
          label={i18n._(msg`Workflow Job Template`)}
          value={
            sourceWorkflowJobTemplate && (
              <Link
                to={`/templates/workflow_job_template/${sourceWorkflowJobTemplate?.id}`}
              >
                {sourceWorkflowJobTemplate?.name}
              </Link>
            )
          }
          dataCy="wa-detail-source-workflow"
        />
        <UserDateDetail
          label={i18n._(msg`Created`)}
          date={workflowApproval.created}
          user={workflowApproval.summary_fields.created_by}
        />
        <Detail
          label={i18n._(msg`Last Modified`)}
          value={formatDateString(workflowApproval.modified)}
        />
        <Detail
          label={i18n._(msg`Finished`)}
          value={formatDateString(workflowApproval.finished)}
        />
        <Detail
          label={i18n._(msg`Canceled`)}
          value={formatDateString(workflowApproval.canceled_on)}
        />
        <Detail
          label={i18n._(msg`Elapsed`)}
          value={secondsToHHMMSS(workflowApproval.elapsed)}
        />
      </DetailList>
      <Title headingLevel="h2">{i18n._(msg`Workflow job details`)}</Title>
      <Divider />
      <WFDetailList gutter="sm">
        <Detail
          label={i18n._(msg`Workflow Job`)}
          value={
            sourceWorkflowJob && sourceWorkflowJob?.id ? (
              <Link to={`/jobs/workflow/${sourceWorkflowJob?.id}`}>
                {`${sourceWorkflowJob?.id} - ${sourceWorkflowJob?.name}`}
              </Link>
            ) : (
              i18n._(msg`Deleted`)
            )
          }
          dataCy="wa-detail-source-job"
        />
        {workflowJob?.limit ? (
          <Detail
            label={i18n._(msg`Limit`)}
            value={workflowJob.limit}
            dataCy="wa-detail-source-job-limit"
          />
        ) : null}
        {workflowJob?.scm_branch ? (
          <Detail
            label={i18n._(msg`Source Control Branch`)}
            value={workflowJob.scm_branch}
            dataCy="wa-detail-source-job-scm"
          />
        ) : null}
        {workflowJob?.summary_fields?.inventory ? (
          <Detail
            label={i18n._(msg`Inventory`)}
            value={
              workflowJob.summary_fields.inventory ? (
                <Link
                  to={`/inventories/${
                    workflowJob.summary_fields.inventory?.kind === 'smart'
                      ? 'smart_inventory'
                      : 'inventory'
                  }/${workflowJob.summary_fields.inventory?.id}/details`}
                >
                  {workflowJob.summary_fields.inventory?.name}
                </Link>
              ) : (
                ' '
              )
            }
            dataCy="wa-detail-inventory"
          />
        ) : null}
        <Detail
          fullWidth
          label={i18n._(msg`Labels`)}
          value={
            <ChipGroup
              numChips={5}
              totalChips={workflowJob.summary_fields.labels.results.length}
              ouiaId="wa-detail-label-chips"
            >
              {workflowJob.summary_fields.labels.results.map((label) => (
                <Chip key={label.id} isReadOnly>
                  {label.name}
                </Chip>
              ))}
            </ChipGroup>
          }
          isEmpty={!workflowJob?.summary_fields?.labels?.results?.length}
        />
        {workflowJob?.extra_vars ? (
          <VariablesDetail
            dataCy="wa-detail-variables"
            id="wa-detail-extra-vars"
            label={i18n._(msg`Variables`)}
            name="extra_vars"
            rows={5}
            value={workflowJob.extra_vars}
          />
        ) : null}
      </WFDetailList>

      <CardActionsRow>
        {workflowApproval.status === 'pending' &&
          workflowApproval.can_approve_or_deny && (
            <>
              <WorkflowApprovalButton
                workflowApproval={workflowApproval}
                isDetailView
                onHandleToast={handleToast}
              />
              <WorkflowDenyButton
                workflowApproval={workflowApproval}
                isDetailView
                onHandleToast={handleToast}
              />
              <JobCancelButton
                onCancelWorkflow={() =>
                  handleToast(
                    workflowApproval.summary_fields.source_workflow_job.id,
                    i18n._(msg`Workflow Cancelled `)
                  )
                }
                title={i18n._(msg`Cancel Workflow`)}
                job={{
                  ...workflowApproval.summary_fields.source_workflow_job,
                  type: 'workflow_job',
                }}
                buttonText={i18n._(msg`Cancel Workflow`)}
                cancelationMessage={i18n._(msg`This will cancel all subsequent nodes in this workflow.`)}
              />
            </>
          )}
        {showDeleteButton && (
          <DeleteButton
            name={workflowApproval.name}
            modalTitle={i18n._(msg`Delete Workflow Approval`)}
            onConfirm={deleteWorkflowApproval}
            isDisabled={isLoading}
          >
            {i18n._(msg`Delete`)}
          </DeleteButton>
        )}
      </CardActionsRow>
      {deleteError && (
        <AlertModal
          isOpen={deleteError}
          variant="error"
          title={i18n._(msg`Error!`)}
          onClose={dismissDeleteError}
        >
          {i18n._(msg`Failed to delete workflow approval.`)}
          <ErrorDetail error={deleteError} />
        </AlertModal>
      )}
      <Toast {...toastProps} />
    </CardBody>
  );
}

WorkflowApprovalDetail.defaultProps = {
  workflowApproval: WorkflowApproval.isRequired,
};

export default WorkflowApprovalDetail;
