import React, { useCallback } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';

import AlertModal from 'components/AlertModal';
import { CardBody, CardActionsRow } from 'components/Card';
import DeleteButton from 'components/DeleteButton';
import { DetailList, Detail, UserDateDetail } from 'components/DetailList';
import ErrorDetail from 'components/ErrorDetail';
import { TokensAPI } from 'api';
import { formatDateString } from 'util/dates';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { toTitleCase } from 'util/strings';
import userHelpTextStrings from '../shared/User.helptext';

function UserTokenDetail({ token }) {
  const { i18n } = useLingui();
  const helptext = userHelpTextStrings(i18n);
  const { scope, description, created, modified, expires, summary_fields } =
    token;
  const history = useHistory();
  const { id, tokenId } = useParams();
  const {
    request: deleteToken,
    isLoading,
    error: deleteError,
  } = useRequest(
    useCallback(async () => {
      await TokensAPI.destroy(tokenId);
      history.push(`/users/${id}/tokens`);
    }, [tokenId, id, history])
  );
  const { error, dismissError } = useDismissableError(deleteError);

  return (
    <CardBody>
      <DetailList>
        <Detail
          label={i18n._(msg`Application`)}
          value={summary_fields?.application?.name}
          dataCy="application-token-detail-name"
          helpText={helptext.application}
        />
        <Detail
          label={i18n._(msg`Description`)}
          value={description}
          dataCy="application-token-detail-description"
        />
        <Detail
          label={i18n._(msg`Scope`)}
          value={toTitleCase(scope)}
          dataCy="application-token-detail-scope"
          helpText={helptext.scope}
        />
        <Detail
          label={i18n._(msg`Expires`)}
          value={formatDateString(expires)}
          dataCy="application-token-detail-expires"
        />
        <UserDateDetail
          label={i18n._(msg`Created`)}
          date={created}
          user={summary_fields.user}
        />
        <UserDateDetail
          label={i18n._(msg`Last Modified`)}
          date={modified}
          user={summary_fields.user}
        />
      </DetailList>
      <CardActionsRow>
        <DeleteButton
          name={summary_fields?.application?.name || i18n._(msg`Personal Access Token`)}
          modalTitle={i18n._(msg`Delete User Token`)}
          onConfirm={deleteToken}
          isDisabled={isLoading}
        >
          {i18n._(msg`Delete`)}
        </DeleteButton>
      </CardActionsRow>
      {error && (
        <AlertModal
          isOpen={error}
          variant="error"
          title={i18n._(msg`Error!`)}
          onClose={dismissError}
        >
          {i18n._(msg`Failed to user token.`)}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </CardBody>
  );
}

export default UserTokenDetail;
