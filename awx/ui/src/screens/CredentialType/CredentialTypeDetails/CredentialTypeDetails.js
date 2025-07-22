import React, { useCallback, useEffect } from 'react';

import { msg } from '@lingui/macro';
import { Link, useHistory } from 'react-router-dom';
import { Button } from '@patternfly/react-core';

import { VariablesDetail } from 'components/CodeEditor';
import AlertModal from 'components/AlertModal';
import { CardBody, CardActionsRow } from 'components/Card';
import DeleteButton from 'components/DeleteButton';
import { Detail, DetailList, UserDateDetail } from 'components/DetailList';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { CredentialTypesAPI } from 'api';
import { jsonToYaml } from 'util/yaml';
import {
  relatedResourceDeleteRequests,
  getRelatedResourceDeleteCounts,
} from 'util/getRelatedResourceDeleteDetails';
import ErrorDetail from 'components/ErrorDetail';
import { useLingui } from '@lingui/react';

function CredentialTypeDetails({ credentialType }) {
  const { i18n } = useLingui();
  const { id, name, description, injectors, inputs } = credentialType;
  const history = useHistory();

  const {
    request: deleteCredentialType,
    isLoading,
    error: deleteError,
  } = useRequest(
    useCallback(async () => {
      await CredentialTypesAPI.destroy(id);
      history.push(`/credential_types`);
    }, [id, history])
  );

  const {
    result: { isDeleteDisabled },
    error: deleteDetailsError,
    request: fetchDeleteDetails,
  } = useRequest(
    useCallback(async () => {
      const { results: deleteDetails, error } =
        await getRelatedResourceDeleteCounts(
          relatedResourceDeleteRequests.credentialType(credentialType)
        );
      if (error) {
        throw new Error(error);
      }
      if (deleteDetails) {
        return { isDeleteDisabled: true };
      }
      return { isDeleteDisabled: false };
    }, [credentialType]),
    { isDeleteDisabled: false }
  );

  useEffect(() => {
    fetchDeleteDetails();
  }, [fetchDeleteDetails]);
  const { error, dismissError } = useDismissableError(
    deleteError || deleteDetailsError
  );

  return (
    <CardBody>
      <DetailList>
        <Detail
          label={i18n._(msg`Name`)}
          value={name}
          dataCy="credential-type-detail-name"
        />
        <Detail label={i18n._(msg`Description`)} value={description} />
        <VariablesDetail
          label={i18n._(msg`Input configuration`)}
          value={jsonToYaml(JSON.stringify(inputs))}
          rows={6}
          name="input"
          dataCy="credential-type-detail-input"
          helpText={i18n._(
            msg`Input schema which defines a set of ordered fields for that type.`
          )}
        />
        <VariablesDetail
          label={i18n._(msg`Injector configuration`)}
          value={jsonToYaml(JSON.stringify(injectors))}
          rows={6}
          name="injector"
          dataCy="credential-type-detail-injector"
          helpText={i18n._(
            msg`Environment variables or extra variables that specify the values a credential type can inject.`
          )}
        />
        <UserDateDetail
          label={i18n._(msg`Created`)}
          date={credentialType.created}
          user={credentialType.summary_fields.created_by}
        />
        <UserDateDetail
          label={i18n._(msg`Last Modified`)}
          date={credentialType.modified}
          user={credentialType.summary_fields.modified_by}
        />
      </DetailList>
      <CardActionsRow>
        {credentialType.summary_fields.user_capabilities &&
          credentialType.summary_fields.user_capabilities.edit && (
            <Button
              ouiaId="credential-type-detail-edit-button"
              aria-label={i18n._(msg`edit`)}
              component={Link}
              to={`/credential_types/${id}/edit`}
            >
              {i18n._(msg`Edit`)}
            </Button>
          )}
        {credentialType.summary_fields.user_capabilities &&
          credentialType.summary_fields.user_capabilities.delete && (
            <DeleteButton
              name={name}
              modalTitle={i18n._(msg`Delete credential type`)}
              onConfirm={deleteCredentialType}
              isDisabled={isLoading || isDeleteDisabled}
              disabledTooltip={
                isDeleteDisabled &&
                i18n._(
                  msg`This credential type is currently being used by some credentials and cannot be deleted`
                )
              }
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
        >
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </CardBody>
  );
}

export default CredentialTypeDetails;
