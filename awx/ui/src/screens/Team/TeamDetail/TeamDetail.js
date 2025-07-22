import React, { useCallback } from 'react';
import { Link, useHistory, useParams } from 'react-router-dom';

import { msg } from '@lingui/macro';
import { Button } from '@patternfly/react-core';
import { useLingui } from '@lingui/react';

import AlertModal from 'components/AlertModal';
import { CardBody, CardActionsRow } from 'components/Card';
import DeleteButton from 'components/DeleteButton';
import { DetailList, Detail } from 'components/DetailList';
import ErrorDetail from 'components/ErrorDetail';
import { formatDateString } from 'util/dates';
import { TeamsAPI } from 'api';
import useRequest, { useDismissableError } from 'hooks/useRequest';

function TeamDetail({ team }) {
  const { i18n } = useLingui();
  const { name, description, created, modified, summary_fields } = team;
  const history = useHistory();
  const { id } = useParams();

  const {
    request: deleteTeam,
    isLoading,
    error: deleteError,
  } = useRequest(
    useCallback(async () => {
      await TeamsAPI.destroy(id);
      history.push(`/teams`);
    }, [id, history])
  );

  const { error, dismissError } = useDismissableError(deleteError);

  return (
    <CardBody>
      <DetailList>
        <Detail
          label={i18n._(msg`Name`)}
          value={name}
          dataCy="team-detail-name"
        />
        <Detail label={i18n._(msg`Description`)} value={description} />
        <Detail
          label={i18n._(msg`Organization`)}
          value={
            <Link to={`/organizations/${summary_fields.organization.id}`}>
              {summary_fields.organization.name}
            </Link>
          }
        />
        <Detail
          label={i18n._(msg`Created`)}
          value={formatDateString(created)}
        />
        <Detail
          label={i18n._(msg`Last Modified`)}
          value={formatDateString(modified)}
        />
      </DetailList>
      <CardActionsRow>
        {summary_fields.user_capabilities &&
          summary_fields.user_capabilities.edit && (
            <Button
              ouiaId="team-detail-edit-button"
              aria-label={i18n._(msg`Edit`)}
              component={Link}
              to={`/teams/${id}/edit`}
            >
              {i18n._(msg`Edit`)}
            </Button>
          )}
        {summary_fields.user_capabilities &&
          summary_fields.user_capabilities.delete && (
            <DeleteButton
              name={name}
              modalTitle={i18n._(msg`Delete Team`)}
              onConfirm={deleteTeam}
              isDisabled={isLoading}
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
          {i18n._(msg`Failed to delete team.`)}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </CardBody>
  );
}

export default TeamDetail;
