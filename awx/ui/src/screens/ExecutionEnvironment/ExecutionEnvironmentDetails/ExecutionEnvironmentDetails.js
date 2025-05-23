import React, { useCallback } from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Link, useHistory } from 'react-router-dom';
import { Button, Label } from '@patternfly/react-core';

import AlertModal from 'components/AlertModal';
import { CardBody, CardActionsRow } from 'components/Card';
import DeleteButton from 'components/DeleteButton';
import { Detail, DetailList, UserDateDetail } from 'components/DetailList';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { toTitleCase } from 'util/strings';
import { ExecutionEnvironmentsAPI } from 'api';
import { relatedResourceDeleteRequests } from 'util/getRelatedResourceDeleteDetails';
import getHelpText from '../shared/ExecutionEnvironment.helptext';

function ExecutionEnvironmentDetails({ executionEnvironment }) {
  const { i18n } = useLingui();
  const helpText = getHelpText(i18n);
  const history = useHistory();
  const {
    id,
    name,
    image,
    description,
    pull,
    organization,
    summary_fields,
    managed: managedByTower,
  } = executionEnvironment;

  const {
    request: deleteExecutionEnvironment,
    isLoading,
    error: deleteError,
  } = useRequest(
    useCallback(async () => {
      await ExecutionEnvironmentsAPI.destroy(id);
      history.push(`/execution_environments`);
    }, [id, history])
  );

  const { error, dismissError } = useDismissableError(deleteError);
  const deleteDetailsRequests =
    relatedResourceDeleteRequests.executionEnvironment(executionEnvironment);
  return (
    <CardBody>
      <DetailList>
        <Detail
          label={i18n._(msg`Name`)}
          value={name}
          dataCy="execution-environment-detail-name"
        />
        <Detail
          label={i18n._(msg`Image`)}
          value={image}
          dataCy="execution-environment-detail-image"
          helpText={helpText.image}
        />
        <Detail
          label={i18n._(msg`Description`)}
          value={description}
          dataCy="execution-environment-detail-description"
        />
        <Detail
          label={i18n._(msg`Managed`)}
          value={managedByTower ? i18n._(msg`True`) : i18n._(msg`False`)}
          dataCy="execution-environment-managed-by-tower"
        />
        <Detail
          label={i18n._(msg`Organization`)}
          value={
            organization ? (
              <Link
                to={`/organizations/${summary_fields.organization.id}/details`}
              >
                {summary_fields.organization.name}
              </Link>
            ) : (
              i18n._(msg`Globally Available`)
            )
          }
          dataCy="execution-environment-detail-organization"
        />

        <Detail
          label={i18n._(msg`Pull`)}
          value={pull === '' ? i18n._(msg`Missing`) : toTitleCase(pull)}
          dataCy="execution-environment-pull"
        />
        {executionEnvironment.summary_fields.credential && (
          <Detail
            label={i18n._(msg`Registry credential`)}
            value={
              <Label variant="outline" color="blue">
                {executionEnvironment.summary_fields.credential.name}
              </Label>
            }
            dataCy="execution-environment-credential"
            helpText={helpText.registryCredential}
          />
        )}
        <UserDateDetail
          label={i18n._(msg`Created`)}
          date={executionEnvironment.created}
          user={executionEnvironment.summary_fields.created_by}
        />
        <UserDateDetail
          label={i18n._(msg`Last Modified`)}
          date={executionEnvironment.modified}
          user={executionEnvironment.summary_fields.modified_by}
        />
      </DetailList>
      <CardActionsRow>
        {summary_fields.user_capabilities?.edit && (
          <Button
            ouiaId="execution-environment-detail-edit-button"
            aria-label={i18n._(msg`edit`)}
            component={Link}
            to={`/execution_environments/${id}/edit`}
          >
            {i18n._(msg`Edit`)}
          </Button>
        )}
        {summary_fields.user_capabilities?.delete && (
          <DeleteButton
            name={image}
            modalTitle={i18n._(msg`Delete Execution Environment`)}
            onConfirm={deleteExecutionEnvironment}
            isDisabled={isLoading}
            ouiaId="delete-button"
            deleteDetailsRequests={deleteDetailsRequests}
            deleteMessage={i18n._(msg`This execution environment is currently being used by other resources. Are you sure you want to delete it?`)}
          >
            {i18n._(msg`Delete`)}
          </DeleteButton>
        )}
      </CardActionsRow>

      {error && (
        <AlertModal
          isOpen={error}
          onClose={dismissError}
          title={i18n._(msg`Error`)}
          variant="error"
        />
      )}
    </CardBody>
  );
}

export default ExecutionEnvironmentDetails;
