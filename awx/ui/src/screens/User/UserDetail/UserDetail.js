import React, { useCallback } from 'react';
import { Link, useHistory } from 'react-router-dom';

import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';

import { Button, Label } from '@patternfly/react-core';
import AlertModal from 'components/AlertModal';
import { CardBody, CardActionsRow } from 'components/Card';
import DeleteButton from 'components/DeleteButton';
import { DetailList, Detail } from 'components/DetailList';
import ErrorDetail from 'components/ErrorDetail';
import { formatDateString } from 'util/dates';
import { UsersAPI } from 'api';
import useRequest, { useDismissableError } from 'hooks/useRequest';

function UserDetail({ user }) {
  const {
    id,
    username,
    email,
    first_name,
    last_name,
    last_login,
    created,
    modified,
    is_superuser,
    is_system_auditor,
    summary_fields,
  } = user;
  const history = useHistory();
  const { i18n } = useLingui();

  const {
    request: deleteUser,
    isLoading,
    error: deleteError,
  } = useRequest(
    useCallback(async () => {
      await UsersAPI.destroy(id);
      history.push(`/users`);
    }, [id, history])
  );

  const { error, dismissError } = useDismissableError(deleteError);

  let user_type;
  if (is_superuser) {
    user_type = i18n._(msg`System Administrator`);
  } else if (is_system_auditor) {
    user_type = i18n._(msg`System Auditor`);
  } else {
    user_type = i18n._(msg`Normal User`);
  }

  let userAuthType;
  if (user.ldap_dn) {
    userAuthType = i18n._(msg`LDAP`);
  } else if (user.auth.length > 0) {
    userAuthType = i18n._(msg`SOCIAL`);
  }

  return (
    <CardBody>
      <DetailList>
        <Detail label={i18n._(msg`First Name`)} value={`${first_name}`} />
        <Detail label={i18n._(msg`Last Name`)} value={`${last_name}`} />
        <Detail label={i18n._(msg`Email`)} value={email} />
        <Detail
          label={i18n._(msg`Username`)}
          value={username}
          dataCy="user-detail-username"
        />
        <Detail label={i18n._(msg`User Type`)} value={`${user_type}`} />
        {userAuthType && (
          <Detail
            label={i18n._(msg`Type`)}
            value={<Label aria-label={i18n._(msg`login type`)}>{userAuthType}</Label>}
          />
        )}
        {last_login && (
          <Detail label={i18n._(msg`Last Login`)} value={formatDateString(last_login)} />
        )}
        <Detail label={i18n._(msg`Created`)} value={formatDateString(created)} />
        {modified && (
          <Detail label={i18n._(msg`Last Modified`)} value={formatDateString(modified)} />
        )}
      </DetailList>
      <CardActionsRow>
        {summary_fields.user_capabilities &&
          summary_fields.user_capabilities.edit && (
            <Button
              ouiaId="user-detail-edit-button"
              aria-label={i18n._(msg`edit`)}
              component={Link}
              to={`/users/${id}/edit`}
            >
              {i18n._(msg`Edit`)}
            </Button>
          )}
        {summary_fields.user_capabilities &&
          summary_fields.user_capabilities.delete && (
            <DeleteButton
              name={username}
              modalTitle={i18n._(msg`Delete User`)}
              onConfirm={deleteUser}
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
          {i18n._(msg`Failed to delete user.`)}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </CardBody>
  );
}

export default UserDetail;
