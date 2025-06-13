import 'styled-components/macro';
import React, { useState } from 'react';
import { Link, useHistory } from 'react-router-dom';

import { msg } from '@lingui/macro';
import { Button, Chip } from '@patternfly/react-core';
import styled from 'styled-components';
import { useLingui } from '@lingui/react';

import { useConfig } from 'contexts/Config';
import AlertModal from 'components/AlertModal';
import {
  DeletedDetail,
  DetailList,
  Detail,
  UserDateDetail,
  LaunchedByDetail,
} from 'components/DetailList';
import { CardBody, CardActionsRow } from 'components/Card';
import ChipGroup from 'components/ChipGroup';
import CredentialChip from 'components/CredentialChip';
import { VariablesDetail } from 'components/CodeEditor';
import DeleteButton from 'components/DeleteButton';
import ErrorDetail from 'components/ErrorDetail';
import { LaunchButton, ReLaunchDropDown } from 'components/LaunchButton';
import StatusLabel from 'components/StatusLabel';
import JobCancelButton from 'components/JobCancelButton';
import ExecutionEnvironmentDetail from 'components/ExecutionEnvironmentDetail';
import { VERBOSITY } from 'components/VerbositySelectField';
import { getJobModel, isJobRunning } from 'util/jobs';
import { formatDateString } from 'util/dates';
import { Job } from 'types';
import getJobHelpText from '../Job.helptext';

const StatusDetailValue = styled.div`
  align-items: center;
  display: inline-grid;
  grid-gap: 10px;
  grid-template-columns: auto auto;
`;

function JobDetail({ job, inventorySourceLabels }) {
  const { i18n } = useLingui();
  const jobHelpText = getJobHelpText();
  const { me } = useConfig();
  const {
    created_by,
    credential,
    credentials,
    instance_group: instanceGroup,
    inventory,
    inventory_source,
    source_project,
    job_template: jobTemplate,
    workflow_job_template: workflowJobTemplate,
    labels,
    project,
    project_update: projectUpdate,
    source_workflow_job,
    execution_environment: executionEnvironment,
  } = job.summary_fields;
  const { scm_branch: scmBranch } = job;
  const [errorMsg, setErrorMsg] = useState();
  const history = useHistory();

  const jobTypes = {
    project_update: i18n._(msg`Source Control Update`),
    inventory_update: i18n._(msg`Inventory Sync`),
    job: job.job_type === 'check' ? i18n._(msg`Playbook Check`) : i18n._(msg`Playbook Run`),
    ad_hoc_command: i18n._(msg`Run Command`),
    system_job: i18n._(msg`Management Job`),
    workflow_job: i18n._(msg`Workflow Job`),
  };

  const scmTypes = {
    '': i18n._(msg`Manual`),
    git: i18n._(msg`Git`),
    svn: i18n._(msg`Subversion`),
    insights: i18n._(msg`Red Hat Insights`),
    archive: i18n._(msg`Remote Archive`),
  };

  const deleteJob = async () => {
    try {
      await getJobModel(job.type).destroy(job.id);
      history.push('/jobs');
    } catch (err) {
      setErrorMsg(err);
    }
  };

  const buildInstanceGroupLink = (item) => (
    <Link to={`/instance_groups/${item.id}`}>{item.name}</Link>
  );

  const buildContainerGroupLink = (item) => (
    <Link to={`/instance_groups/container_group/${item.id}`}>{item.name}</Link>
  );

  const renderInventoryDetail = () => {
    if (
      job.type !== 'project_update' &&
      job.type !== 'system_job' &&
      job.type !== 'workflow_job'
    ) {
      return inventory ? (
        <Detail
          dataCy="job-inventory"
          label={i18n._(msg`Inventory`)}
          helpText={jobHelpText.inventory}
          value={
            inventory.name ? (
              <Link
                to={
                  inventory.kind === 'smart'
                    ? `/inventories/smart_inventory/${inventory.id}`
                    : `/inventories/inventory/${inventory.id}`
                }
              >
                {inventory.name}
              </Link>
            ) : (
              'Unknown Inventory'
            )
          }
        />
      ) : (
        <DeletedDetail label={i18n._(msg`Inventory`)} helpText={jobHelpText.inventory} />
      );
    }
    if (job.type === 'workflow_job') {
      return inventory ? (
        <Detail
          dataCy="job-inventory"
          label={i18n._(msg`Inventory`)}
          helpText={jobHelpText.inventory}
          value={
            inventory.name ? (
              <Link
                to={
                  inventory.kind === 'smart'
                    ? `/inventories/smart_inventory/${inventory.id}`
                    : `/inventories/inventory/${inventory.id}`
                }
              >
                {inventory.name}
              </Link>
            ) : (
              'Unknown Inventory'
            )
          }
        />
      ) : null;
    }
    return null;
  };

  const renderProjectDetail = () => {
    if (
      (job.type !== 'ad_hoc_command' &&
        job.type !== 'inventory_update' &&
        job.type !== 'system_job' &&
        job.type !== 'workflow_job') ||
      source_project
    ) {
      const projectDetailsLink = `/projects/${
        project ? project?.id : source_project?.id
      }/details`;

      const jobLink = `/jobs/project/${
        project ? projectUpdate?.id : job.source_project_update
      }`;

      let projectName = '';
      if (project?.name || source_project?.name) {
        projectName = project ? project.name : source_project.name;
      }
      return project || inventory_source ? (
        <>
          <Detail
            dataCy="job-project"
            label={project ? i18n._(msg`Project`) : i18n._(msg`Source`)}
            helpText={
              project ? jobHelpText.project : jobHelpText.project_source
            }
            value={
              projectName ? (
                <Link to={`${projectDetailsLink}`}>{projectName}</Link>
              ) : (
                'Unknown Project'
              )
            }
          />
          <Detail
            dataCy="job-project-status"
            label={i18n._(msg`Project Update Status`)}
            helpText={jobHelpText.projectUpdate}
            value={
              projectUpdate || job.source_project_update ? (
                <Link to={`${jobLink}`}>
                  <StatusLabel
                    status={
                      projectUpdate
                        ? projectUpdate.status
                        : source_project.status
                    }
                  />
                </Link>
              ) : (
                'No Status Available'
              )
            }
          />
        </>
      ) : (
        <DeletedDetail label={i18n._(msg`Project`)} />
      );
    }
    return null;
  };
  return (
    <CardBody>
      <DetailList>
        <Detail dataCy="job-id" label={i18n._(msg`Job ID`)} value={validateReactNode(job.id)} />
        <Detail
          dataCy="job-status"
          fullWidth={Boolean(job.job_explanation)}
          label={i18n._(msg`Status`)}
          value={
            <StatusDetailValue>
              {validateReactNode(job.status) ? <StatusLabel status={job.status} /> : 'Unknown Status'}
              {job?.job_explanation && job.job_explanation !== job.status
                ? validateReactNode(job.job_explanation)
                : null}
            </StatusDetailValue>
          }
        />
        <Detail
          dataCy="job-started-date"
          label={i18n._(msg`Started`)}
          value={formatDateString(job.started) || 'Unknown Start Date'}
        />
        {job?.finished && (
          <Detail
            dataCy="job-finished-date"
            label={i18n._(msg`Finished`)}
            value={formatDateString(job.finished) || 'Unknown Finish Date'}
          />
        )}
        {jobTemplate && (
          <Detail
            dataCy="job-template"
            label={i18n._(msg`Job Template`)}
            value={
              jobTemplate.name ? (
                <Link to={`/templates/job_template/${jobTemplate.id}`}>
                  {jobTemplate.name}
                </Link>
              ) : (
                'Unknown Template'
              )
            }
          />
        )}
        {workflowJobTemplate && (
          <Detail
            dataCy="workflow-job-template"
            label={i18n._(msg`Workflow Job Template`)}
            value={
              workflowJobTemplate.name ? (
                <Link
                  to={`/templates/workflow_job_template/${workflowJobTemplate.id}`}
                >
                  {workflowJobTemplate.name}
                </Link>
              ) : (
                'Unknown Workflow Template'
              )
            }
          />
        )}
        {source_workflow_job && (
          <Detail
            dataCy="source-workflow-job"
            label={i18n._(msg`Source Workflow Job`)}
            value={
              source_workflow_job.name ? (
                <Link to={`/jobs/workflow/${source_workflow_job.id}`}>
                  {source_workflow_job.id} - {source_workflow_job.name}
                </Link>
              ) : (
                'Unknown Workflow Job'
              )
            }
          />
        )}
        <Detail
          dataCy="job-type"
          label={i18n._(msg`Job Type`)}
          helpText={jobHelpText.jobType}
          value={jobTypes[job.type]}
        />
        <Detail
          dataCy="source-control-type"
          label={i18n._(msg`Source Control Type`)}
          value={scmTypes[job.scm_type]}
        />
        <LaunchedByDetail dataCy="job-launched-by" job={job} />
        {renderInventoryDetail()}
        {inventory_source && (
          <>
            <Detail
              dataCy="job-inventory-source"
              label={i18n._(msg`Inventory Source`)}
              value={
                <Link
                  to={`/inventories/inventory/${inventory.id}/sources/${inventory_source.id}`}
                >
                  {inventory_source.name}
                </Link>
              }
            />
            {!source_project && (
              <Detail
                dataCy="job-inventory-source-type"
                label={i18n._(msg`Source`)}
                value={inventorySourceLabels.map(([string, label]) =>
                  string === job.source ? label : null
                )}
                isEmpty={inventorySourceLabels.length === 0}
              />
            )}
          </>
        )}
        {renderProjectDetail()}
        {scmBranch && (
          <Detail
            dataCy="source-control-branch"
            label={i18n._(msg`Source Control Branch`)}
            helpText={jobHelpText.sourceControlBranch}
            value={scmBranch}
          />
        )}
        <Detail
          dataCy="job-scm-revision"
          label={i18n._(msg`Revision`)}
          value={job.scm_revision}
        />
        <Detail
          dataCy="job-playbook"
          label={i18n._(msg`Playbook`)}
          helpText={jobHelpText.playbook}
          value={job.playbook}
        />
        <Detail
          dataCy="job-limit"
          label={i18n._(msg`Limit`)}
          helpText={jobHelpText.limit}
          value={job.limit}
        />
        <Detail
          dataCy="job-verbosity"
          label={i18n._(msg`Verbosity`)}
          helpText={jobHelpText.verbosity}
          value={VERBOSITY(i18n)[job.verbosity]}
        />
        {job.type !== 'workflow_job' && !isJobRunning(job.status) && (
          <ExecutionEnvironmentDetail
            dataCy="job-execution-environment"
            executionEnvironment={executionEnvironment}
            helpText={jobHelpText.executionEnvironment}
            verifyMissingVirtualEnv={false}
          />
        )}
        <Detail
          dataCy="job-execution-node"
          label={i18n._(msg`Execution Node`)}
          value={job.execution_node}
        />
        {job?.controller_node ? (
          <Detail
            dataCy="job-controller-node"
            label={i18n._(msg`Controller Node`)}
            value={job.controller_node}
          />
        ) : null}
        {instanceGroup && !instanceGroup?.is_container_group && (
          <Detail
            dataCy="job-instance-group"
            label={i18n._(msg`Instance Group`)}
            helpText={jobHelpText.instanceGroups}
            value={buildInstanceGroupLink(instanceGroup)}
          />
        )}
        {instanceGroup && instanceGroup?.is_container_group && (
          <Detail
            dataCy="job-container-group"
            label={i18n._(msg`Container Group`)}
            value={buildContainerGroupLink(instanceGroup)}
          />
        )}
        {typeof job.job_slice_number === 'number' &&
          typeof job.job_slice_count === 'number' && (
            <Detail
              dataCy="job-slice"
              label={i18n._(msg`Job Slice`)}
              helpText={jobHelpText.jobSlicing}
              value={`${job.job_slice_number}/${job.job_slice_count}`}
            />
          )}
        {job.type === 'workflow_job' && job.is_sliced_job && (
          <Detail
            dataCy="job-slice-parent"
            label={i18n._(msg`Job Slice Parent`)}
            value={i18n._(msg`True`)}
          />
        )}
        {typeof job.forks === 'number' && (
          <Detail
            dataCy="forks"
            label={i18n._(msg`Forks`)}
            value={`${job.forks}`}
            helpText={jobHelpText.forks}
          />
        )}
        {typeof job.timeout === 'number' && (
          <Detail
            dataCy="timeout"
            label={i18n._(msg`Timeout`)}
            value={i18n._(validateReactNode(
              job.timeout ? msg`${job.timeout} seconds` : msg`No timeout specified`
            ))}
            helpText={jobHelpText.timeout}
          />
        )}
        {credential && (
          <Detail
            dataCy="job-machine-credential"
            label={i18n._(msg`Machine Credential`)}
            value={
              <ChipGroup
                numChips={5}
                totalChips={1}
                ouiaId="job-machine-credential-chips"
              >
                <CredentialChip
                  key={credential.id}
                  credential={credential}
                  isReadOnly
                  ouiaId={`job-machine-credential-${credential.id}-chip`}
                />
              </ChipGroup>
            }
          />
        )}
        {credentials && (
          <Detail
            dataCy="job-credentials"
            fullWidth
            helpText={jobHelpText.credentials}
            label={i18n._(msg`Credentials`)}
            value={
              <ChipGroup
                numChips={5}
                totalChips={credentials.length}
                ouiaId="job-credential-chips"
              >
                {credentials.map((c) => (
                  <CredentialChip
                    key={c.id}
                    credential={c}
                    isReadOnly
                    ouiaId={`job-credential-${c.id}-chip`}
                  />
                ))}
              </ChipGroup>
            }
            isEmpty={credentials.length === 0}
          />
        )}
        {labels && labels.count > 0 && (
          <Detail
            dataCy="job-labels"
            fullWidth
            label={i18n._(msg`Labels`)}
            helpText={jobHelpText.labels}
            value={
              <ChipGroup
                numChips={5}
                totalChips={labels.results.length}
                ouiaId="job-label-chips"
              >
                {labels.results.map((l) => (
                  <Chip key={l.id} isReadOnly ouiaId={`job-label-${l.id}-chip`}>
                    {l.name}
                  </Chip>
                ))}
              </ChipGroup>
            }
          />
        )}
        {job.job_tags && (
          <Detail
            dataCy="job-tags"
            fullWidth
            label={i18n._(msg`Job Tags`)}
            helpText={jobHelpText.jobTags}
            value={
              <ChipGroup
                numChips={5}
                totalChips={job.job_tags.split(',').length}
                ouiaId="job-tag-chips"
              >
                {job.job_tags.split(',').map((jobTag) => (
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
            isEmpty={job.job_tags.length === 0}
          />
        )}
        {job.skip_tags && (
          <Detail
            dataCy="job-skip-tags"
            fullWidth
            label={i18n._(msg`Skip Tags`)}
            helpText={jobHelpText.skipTags}
            value={
              <ChipGroup
                numChips={5}
                totalChips={job.skip_tags.split(',').length}
                ouiaId="job-skip-tag-chips"
              >
                {job.skip_tags.split(',').map((skipTag) => (
                  <Chip
                    key={skipTag}
                    isReadOnly
                    ouiaId={`job-skip-tag-${skipTag}-chip`}
                  >
                    {skipTag}
                  </Chip>
                ))}
              </ChipGroup>
            }
            isEmpty={job.skip_tags.length === 0}
          />
        )}
        <Detail
          dataCy="job-module-name"
          label={i18n._(msg`Module Name`)}
          value={job.module_name}
          helpText={jobHelpText.module(job.module_name)}
        />
        <Detail
          dataCy="job-module-arguments"
          label={i18n._(msg`Module Arguments`)}
          value={job.module_args}
        />
        <UserDateDetail
          label={i18n._(msg`Created`)}
          date={job.created}
          user={created_by}
        />
        <UserDateDetail label={i18n._(msg`Last Modified`)} date={job.modified} />
        {job.extra_vars && (
          <VariablesDetail
            css="margin: 20px 0"
            id="job-variables"
            readOnly
            value={job.extra_vars}
            rows={4}
            label={i18n._(msg`Variables`)}
            name="extra_vars"
            dataCy="job-detail-extra-variables"
            helpText={jobHelpText.variables}
          />
        )}
        {job.artifacts && (
          <VariablesDetail
            css="margin: 20px 0"
            id="job-artifacts"
            readOnly
            value={JSON.stringify(job.artifacts)}
            rows={4}
            label={i18n._(msg`Artifacts`)}
            name="artifacts"
            dataCy="job-detail-artifacts"
          />
        )}
      </DetailList>
      <CardActionsRow>
        {job.type !== 'system_job' &&
          job.summary_fields.user_capabilities.start &&
          (job.status === 'failed' && job.type === 'job' ? (
            <LaunchButton resource={job}>
              {({ handleRelaunch, isLaunching }) => (
                <ReLaunchDropDown
                  ouiaId="job-detail-relaunch-dropdown"
                  isPrimary
                  handleRelaunch={handleRelaunch}
                  isLaunching={isLaunching}
                />
              )}
            </LaunchButton>
          ) : (
            <LaunchButton resource={job} aria-label={i18n._(msg`Relaunch`)}>
              {({ handleRelaunch, isLaunching }) => (
                <Button
                  ouiaId="job-detail-relaunch-button"
                  type="submit"
                  onClick={() => handleRelaunch()}
                  isDisabled={isLaunching}
                >
                  {i18n._(msg`Relaunch`)}
                </Button>
              )}
            </LaunchButton>
          ))}
        {isJobRunning(job.status) &&
          (job.type === 'system_job'
            ? me.is_superuser
            : job?.summary_fields?.user_capabilities?.start) && (
            <JobCancelButton
              job={job}
              errorTitle={i18n._(msg`Job Cancel Error`)}
              title={i18n._(msg`Cancel ${job.name}`)}
              errorMessage={i18n._(msg`Failed to cancel ${job.name}`)}
            />
          )}
        {!isJobRunning(job.status) &&
          job?.summary_fields?.user_capabilities?.delete && (
            <DeleteButton
              name={job.name}
              modalTitle={i18n._(msg`Delete Job`)}
              onConfirm={deleteJob}
              ouiaId="job-detail-delete-button"
            >
              {i18n._(msg`Delete`)}
            </DeleteButton>
          )}
      </CardActionsRow>
      {errorMsg && (
        <AlertModal
          isOpen={errorMsg}
          variant="error"
          onClose={() => setErrorMsg()}
          title={i18n._(msg`Job Delete Error`)}
        >
          <ErrorDetail error={errorMsg} />
        </AlertModal>
      )}
    </CardBody>
  );
}
JobDetail.propTypes = {
  job: Job.isRequired,
};

export default JobDetail;

function validateReactNode(value) {
  if (value === null || value === undefined) return 'Unknown';
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}
