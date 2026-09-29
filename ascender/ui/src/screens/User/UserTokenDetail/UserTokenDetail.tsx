import type { OAuth2Token } from 'types/api';
import React, { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLingui } from '@lingui/react/macro';

import AlertModal from 'components/AlertModal';
import { CardBody, CardActionsRow } from 'components/Card';
import DeleteButton from 'components/DeleteButton';
import { DetailList, Detail, UserDateDetail } from 'components/DetailList';
import ErrorDetail from 'components/ErrorDetail';
import { TokensAPI } from 'api';
import { formatDateString } from 'util/dates';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { useConfig } from 'contexts/Config';
import { toTitleCase } from 'util/strings';
import userHelpTextStrings from '../shared/User.helptext';
import canDeleteToken from '../shared/canDeleteToken';

export interface UserTokenDetailProps {
  token: OAuth2Token;
  /**
   * Where the page's Back tab leads, the application's Tokens tab when the
   * token was reached from there. A deleted token's page has nothing left to
   * show, so Delete goes the same way.
   */
  backLink?: string;
  [key: string]: unknown;
}

function UserTokenDetail({ token, backLink }: UserTokenDetailProps) {
  const { t } = useLingui();
  const helptext = userHelpTextStrings();
  const { scope, description, created, modified, expires, summary_fields } =
    token;
  const navigate = useNavigate();
  const { id, tokenId } = useParams() as { id: string; tokenId: string };
  const {
    request: deleteToken,
    isLoading,
    error: deleteError,
  } = useRequest(
    useCallback(async () => {
      await TokensAPI.destroy(tokenId);
      navigate(backLink ?? `/users/${id}/tokens`);
    }, [tokenId, id, navigate, backLink])
  );
  const { error, dismissError } = useDismissableError(deleteError);
  const { me, adminOrgCount } = useConfig();

  // The token names its application by id and name only, so the helper has
  // no application capability to go on here unless that reference carries
  // one, and falls back to offering Delete to any organization admin, which
  // the api then decides on.
  const canDelete = canDeleteToken(
    token,
    me,
    adminOrgCount as number | undefined
  );

  return (
    <CardBody>
      <DetailList>
        <Detail
          label={t`Application`}
          value={summary_fields?.application?.name}
          dataCy="application-token-detail-name"
          helpText={helptext.application}
        />
        <Detail
          label={t`Description`}
          value={description}
          dataCy="application-token-detail-description"
        />
        <Detail
          label={t`Scope`}
          value={toTitleCase(scope)}
          dataCy="application-token-detail-scope"
          helpText={helptext.scope}
        />
        <Detail
          label={t`Expires`}
          value={formatDateString(expires)}
          dataCy="application-token-detail-expires"
        />
        <UserDateDetail
          label={t`Created`}
          date={created}
          user={summary_fields.user}
        />
        <UserDateDetail
          label={t`Last Modified`}
          date={modified}
          user={summary_fields.user}
        />
      </DetailList>
      <CardActionsRow>
        {canDelete && (
          <DeleteButton
            name={summary_fields?.application?.name || t`Personal Access Token`}
            modalTitle={t`Delete User Token`}
            onConfirm={deleteToken}
            isDisabled={isLoading}
          >
            {t`Delete`}
          </DeleteButton>
        )}
      </CardActionsRow>
      {Boolean(error) && (
        <AlertModal
          isOpen={error}
          variant="error"
          title={t`Error!`}
          onClose={dismissError}
        >
          {t`Failed to delete user token.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </CardBody>
  );
}

export default UserTokenDetail;
