import type { ExecutionEnvironmentBuilder } from 'types/api';
import React, { useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Link, useNavigate } from 'react-router';
import { Button, Label } from '@patternfly/react-core';

import AlertModal from 'components/AlertModal';
import { CardBody, CardActionsRow } from 'components/Card';
import DeleteButton from 'components/DeleteButton';
import ErrorDetail from 'components/ErrorDetail';
import {
  DeletedDetail,
  Detail,
  DetailList,
  UserDateDetail,
} from 'components/DetailList';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { ExecutionEnvironmentBuildersAPI } from 'api';
import useLaunchBuild from '../shared/useLaunchBuild';
import useExecutionEnvironmentBuilderHelpTextStrings from '../shared/ExecutionEnvironmentBuilder.helptext';

export interface ExecutionEnvironmentBuilderDetailsProps {
  executionEnvironmentBuilder: ExecutionEnvironmentBuilder;
}

function ExecutionEnvironmentBuilderDetails({
  executionEnvironmentBuilder,
}: ExecutionEnvironmentBuilderDetailsProps) {
  const { t } = useLingui();
  const helpText = useExecutionEnvironmentBuilderHelpTextStrings();
  const navigate = useNavigate();
  const {
    id,
    name,
    description,
    image,
    tag,
    execution_environment_file: executionEnvironmentFile,
    summary_fields: summaryFields,
  } = executionEnvironmentBuilder;
  const { organization, project, credential } = summaryFields;

  const {
    request: deleteBuilder,
    isLoading: isDeleting,
    error: deleteError,
  } = useRequest(
    useCallback(async () => {
      await ExecutionEnvironmentBuildersAPI.destroy(id);
      navigate(`/execution_environment_builders`);
    }, [id, navigate])
  );
  const { error, dismissError } = useDismissableError(deleteError);
  const {
    launch,
    isLaunching,
    error: launchError,
    dismissError: dismissLaunchError,
  } = useLaunchBuild(id);

  return (
    <CardBody>
      <DetailList>
        <Detail
          label={t`Name`}
          value={name}
          dataCy="execution-environment-builder-detail-name"
        />
        <Detail
          label={t`Description`}
          value={description}
          dataCy="execution-environment-builder-detail-description"
        />
        <Detail
          label={t`Organization`}
          value={
            organization && (
              <Link to={`/organizations/${organization.id}/details`}>
                {organization.name}
              </Link>
            )
          }
          helpText={helpText.organization}
          dataCy="execution-environment-builder-detail-organization"
        />
        <Detail
          label={t`Image`}
          value={image && tag ? `${image}:${tag}` : image}
          helpText={helpText.image}
          dataCy="execution-environment-builder-detail-image"
        />
        {project ? (
          <Detail
            label={t`Project`}
            value={
              <Link to={`/projects/${project.id}/details`}>{project.name}</Link>
            }
            helpText={helpText.project}
            dataCy="execution-environment-builder-detail-project"
          />
        ) : (
          <DeletedDetail label={t`Project`} helpText={helpText.project} />
        )}
        <Detail
          label={t`Execution Environment File`}
          value={executionEnvironmentFile}
          helpText={helpText.executionEnvironmentFile}
          dataCy="execution-environment-builder-detail-file"
        />
        {credential && (
          <Detail
            label={t`Registry credential`}
            value={
              <Label variant="outline" color="blue">
                {credential.name}
              </Label>
            }
            helpText={helpText.registryCredential}
            dataCy="execution-environment-builder-detail-credential"
          />
        )}
        <UserDateDetail
          label={t`Created`}
          date={executionEnvironmentBuilder.created}
          user={summaryFields.created_by}
        />
        <UserDateDetail
          label={t`Last Modified`}
          date={executionEnvironmentBuilder.modified}
          user={summaryFields.modified_by}
        />
      </DetailList>
      <CardActionsRow>
        {summaryFields.user_capabilities?.edit && (
          <Button
            ouiaId="execution-environment-builder-detail-edit-button"
            aria-label={t`edit`}
            component={Link}
            to={`/execution_environment_builders/${id}/edit`}
          >
            {t`Edit`}
          </Button>
        )}
        {summaryFields.user_capabilities?.start && (
          <Button
            ouiaId="execution-environment-builder-detail-build-button"
            variant="secondary"
            onClick={() => launch()}
            isDisabled={isLaunching || !project}
          >
            {t`Build`}
          </Button>
        )}
        {summaryFields.user_capabilities?.delete && (
          <DeleteButton
            name={name}
            modalTitle={t`Delete Execution Environment Builder`}
            onConfirm={deleteBuilder}
            isDisabled={isDeleting}
            ouiaId="execution-environment-builder-detail-delete-button"
            deleteMessage={t`Deleting a builder also deletes all of its builds. Are you sure you want to delete it?`}
          >
            {t`Delete`}
          </DeleteButton>
        )}
      </CardActionsRow>
      {Boolean(error) && (
        <AlertModal
          isOpen={Boolean(error)}
          onClose={dismissError}
          title={t`Error`}
          variant="error"
        >
          {t`Failed to delete execution environment builder.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
      {Boolean(launchError) && (
        <AlertModal
          isOpen={Boolean(launchError)}
          onClose={dismissLaunchError}
          title={t`Error`}
          variant="error"
        >
          {t`Failed to start the build.`}
          <ErrorDetail error={launchError} />
        </AlertModal>
      )}
    </CardBody>
  );
}

export default ExecutionEnvironmentBuilderDetails;
