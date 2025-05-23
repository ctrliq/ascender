import React, { useCallback } from 'react';
import { Link, useHistory } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import styled from 'styled-components';
import {
  Button,
  ClipboardCopy,
  TextList,
  TextListItem,
  TextListVariants,
  TextListItemVariants,
  Tooltip,
} from '@patternfly/react-core';
import { Project } from 'types';
import { Config, useConfig } from 'contexts/Config';
import AlertModal from 'components/AlertModal';
import { CardBody, CardActionsRow } from 'components/Card';
import DeleteButton from 'components/DeleteButton';
import { DetailList, Detail, UserDateDetail } from 'components/DetailList';
import ErrorDetail from 'components/ErrorDetail';
import JobCancelButton from 'components/JobCancelButton';
import ExecutionEnvironmentDetail from 'components/ExecutionEnvironmentDetail';
import CredentialChip from 'components/CredentialChip';
import { ProjectsAPI } from 'api';
import { toTitleCase } from 'util/strings';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import useBrandName from 'hooks/useBrandName';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';
import StatusLabel from 'components/StatusLabel';
import { formatDateString } from 'util/dates';
import Popover from 'components/Popover';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import ProjectSyncButton from '../shared/ProjectSyncButton';
import getProjectHelpText from '../shared/Project.helptext';
import useWsProject from './useWsProject';

const Label = styled.span`
  color: var(--pf-global--disabled-color--100);
`;

function ProjectDetail({ project }) {
  const { i18n } = useLingui();
  const projectHelpText = getProjectHelpText(i18n);
  const {
    allow_override,
    created,
    custom_virtualenv,
    description,
    id,
    local_path,
    modified,
    name,
    scm_branch,
    scm_clean,
    scm_delete_on_update,
    scm_track_submodules,
    scm_refspec,
    scm_revision,
    scm_type,
    scm_update_on_launch,
    scm_update_cache_timeout,
    scm_url,
    summary_fields,
  } = useWsProject(project);
  const docsURL = `${getDocsBaseUrl(
    useConfig()
  )}/html/userguide/projects.html#manage-playbooks-using-source-control`;
  const history = useHistory();
  const {
    request: deleteProject,
    isLoading,
    error: deleteError,
  } = useRequest(
    useCallback(async () => {
      await ProjectsAPI.destroy(id);
      history.push(`/projects`);
    }, [id, history])
  );
  const brandName = useBrandName();

  const { error, dismissError } = useDismissableError(deleteError);
  const deleteDetailsRequests = relatedResourceDeleteRequests.project(project);
  let optionsList = '';
  if (
    scm_clean ||
    scm_delete_on_update ||
    scm_track_submodules ||
    scm_update_on_launch ||
    allow_override
  ) {
    optionsList = (
      <TextList component={TextListVariants.ul}>
        {scm_clean && (
          <TextListItem component={TextListItemVariants.li}>
            {i18n._(`Discard local changes before syncing`)}
            <Popover content={projectHelpText.options.clean} />
          </TextListItem>
        )}
        {scm_delete_on_update && (
          <TextListItem component={TextListItemVariants.li}>
            {i18n._(`Delete the project before syncing`)}{' '}
            <Popover
              content={projectHelpText.options.delete}
              id="scm-delete-on-update"
            />
          </TextListItem>
        )}
        {scm_track_submodules && (
          <TextListItem component={TextListItemVariants.li}>
            {i18n._(`Track submodules latest commit on branch`)}{' '}
            <Popover content={projectHelpText.options.trackSubModules} />
          </TextListItem>
        )}
        {scm_update_on_launch && (
          <TextListItem component={TextListItemVariants.li}>
            {i18n._(`Update revision on job launch`)}{' '}
            <Popover content={projectHelpText.options.updateOnLaunch} />
          </TextListItem>
        )}
        {allow_override && (
          <TextListItem component={TextListItemVariants.li}>
            {i18n._(`Allow branch override`)}{' '}
            <Popover content={projectHelpText.options.allowBranchOverride} />
          </TextListItem>
        )}
      </TextList>
    );
  }
  const generateLastJobTooltip = (job) => (
    <>
      <div>{i18n._(`MOST RECENT SYNC`)}</div>
      <div>
        {i18n._(`JOB ID:`)} {job.id}
      </div>
      <div>
        {i18n._(`STATUS:`)} {job.status.toUpperCase()}
      </div>
      {job.finished && (
        <div>
          {i18n._(`FINISHED:`)} {formatDateString(job.finished)}
        </div>
      )}
    </>
  );

  let job = null;

  if (summary_fields?.current_job) {
    job = summary_fields.current_job;
  } else if (summary_fields?.last_job) {
    job = summary_fields.last_job;
  }

  const getSourceControlUrlHelpText = () =>
    scm_type === 'git'
      ? projectHelpText.githubSourceControlUrl
      : projectHelpText.svnSourceControlUrl;
  return (
    <CardBody>
      <DetailList gutter="sm">
        <Detail
          label={i18n._(`Last Job Status`)}
          value={
            job && (
              <Tooltip
                position="top"
                content={generateLastJobTooltip(job)}
                key={job.id}
              >
                <Link to={`/jobs/project/${job.id}`}>
                  <StatusLabel status={job.status} />
                </Link>
              </Tooltip>
            )
          }
        />
        <Detail label={i18n._(`Name`)} value={name} dataCy="project-detail-name" />
        <Detail label={i18n._(`Description`)} value={description} />
        {summary_fields.organization && (
          <Detail
            label={i18n._(`Organization`)}
            value={
              <Link
                to={`/organizations/${summary_fields.organization.id}/details`}
              >
                {summary_fields.organization.name}
              </Link>
            }
          />
        )}
        <Detail
          label={i18n._(`Source Control Type`)}
          value={scm_type === '' ? i18n._(`Manual`) : toTitleCase(project.scm_type)}
        />
        <Detail
          label={i18n._(`Source Control Revision`)}
          value={
            scm_revision ? (
              <ClipboardCopy
                data-cy="project-copy-revision"
                variant="inline-compact"
                clickTip={i18n._(`Successfully copied to clipboard!`)}
                hoverTip={i18n._(`Copy full revision to clipboard.`)}
                onCopy={() =>
                  navigator.clipboard.writeText(scm_revision.toString())
                }
              >
                {scm_revision.substring(0, 7)}
              </ClipboardCopy>
            ) : (
              <Label
                aria-label={i18n._(`The project must be synced before a revision is available.`)}
              >
                {i18n._(`Sync for revision`)}
              </Label>
            )
          }
          alwaysVisible
        />
        <Detail
          helpText={
            scm_type === 'git' || scm_type === 'svn'
              ? getSourceControlUrlHelpText()
              : ''
          }
          label={i18n._(`Source Control URL`)}
          value={scm_url}
        />
        <Detail
          helpText={projectHelpText.branchFormField}
          label={i18n._(`Source Control Branch`)}
          value={scm_branch}
        />
        <Detail
          helpText={projectHelpText.sourceControlRefspec(docsURL)}
          label={i18n._(`Source Control Refspec`)}
          value={scm_refspec}
        />
        {summary_fields.signature_validation_credential && (
          <Detail
            label={i18n._(`Content Signature Validation Credential`)}
            helpText={projectHelpText.signatureValidation}
            value={
              <CredentialChip
                key={summary_fields.signature_validation_credential.id}
                credential={summary_fields.signature_validation_credential}
                isReadOnly
              />
            }
            isEmpty={
              summary_fields.signature_validation_credential.length === 0
            }
          />
        )}
        {summary_fields.credential && (
          <Detail
            label={i18n._(`Source Control Credential`)}
            value={
              <CredentialChip
                key={summary_fields.credential.id}
                credential={summary_fields.credential}
                isReadOnly
              />
            }
            isEmpty={summary_fields.credential.length === 0}
          />
        )}
        <Detail
          label={i18n._(`Cache Timeout`)}
          value={`${scm_update_cache_timeout} ${i18n._(`Seconds`)}`}
        />
        <ExecutionEnvironmentDetail
          helpText={projectHelpText.executionEnvironment}
          virtualEnvironment={custom_virtualenv}
          executionEnvironment={summary_fields?.default_environment}
          isDefaultEnvironment
        />
        <Config>
          {({ project_base_dir }) => (
            <Detail
              helpText={projectHelpText.projectBasePath(brandName)}
              label={i18n._(`Project Base Path`)}
              value={project_base_dir}
            />
          )}
        </Config>
        <Detail
          helpText={projectHelpText.projectLocalPath}
          label={i18n._(`Playbook Directory`)}
          value={local_path}
        />
        <UserDateDetail
          label={i18n._(`Created`)}
          date={created}
          user={summary_fields.created_by}
        />
        <UserDateDetail
          label={i18n._(`Last Modified`)}
          date={modified}
          user={summary_fields.modified_by}
        />
        {optionsList && (
          <Detail fullWidth label={i18n._(`Enabled Options`)} value={optionsList} />
        )}
      </DetailList>
      <CardActionsRow>
        {summary_fields.user_capabilities?.edit && (
          <Button
            ouiaId="project-detail-edit-button"
            aria-label={i18n._(`edit`)}
            component={Link}
            to={`/projects/${id}/edit`}
          >
            {i18n._(`Edit`)}
          </Button>
        )}
        {summary_fields.user_capabilities?.start &&
          (['running', 'pending', 'waiting'].includes(job?.status) ? (
            <JobCancelButton
              job={{ id: job.id, type: 'project_update' }}
              errorTitle={i18n._(`Project Sync Error`)}
              title={i18n._(`Cancel Project Sync`)}
              errorMessage={i18n._(`Failed to cancel Project Sync`)}
              buttonText={i18n._(`Cancel Sync`)}
            />
          ) : (
            <ProjectSyncButton
              projectId={project.id}
              lastJobStatus={job && job.status}
            />
          ))}
        {summary_fields.user_capabilities?.delete && (
          <DeleteButton
            name={name}
            modalTitle={i18n._(`Delete Project`)}
            onConfirm={deleteProject}
            isDisabled={isLoading || job?.status === 'running'}
            deleteDetailsRequests={deleteDetailsRequests}
            deleteMessage={i18n._(`This project is currently being used by other resources. Are you sure you want to delete it?`)}
          >
            {i18n._(`Delete`)}
          </DeleteButton>
        )}
      </CardActionsRow>
      {error && (
        <AlertModal
          isOpen={error}
          variant="error"
          title={i18n._(`Error!`)}
          onClose={dismissError}
        >
          {i18n._(`Failed to delete project.`)}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </CardBody>
  );
}

ProjectDetail.propTypes = {
  project: Project.isRequired,
};

export default ProjectDetail;
