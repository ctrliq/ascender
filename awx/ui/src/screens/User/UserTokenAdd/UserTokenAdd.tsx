import type { OAuth2Token } from 'types/api';
import React, { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';

import { CardBody } from 'components/Card';
import { TokensAPI, UsersAPI } from 'api';
import useRequest from 'hooks/useRequest';
import UserTokenForm from '../shared/UserTokenForm';
import type { UserTokenFormValues } from '../shared/UserTokenForm';

export interface UserTokenAddProps {
  /** Hands the new token up so the list can show it once, in the clear. */
  onSuccessfulAdd: (token: OAuth2Token) => void;
}

function UserTokenAdd({ onSuccessfulAdd }: UserTokenAddProps) {
  const navigate = useNavigate();
  const { id: userId } = useParams() as { id: string };
  const { error: submitError, request: handleSubmit } = useRequest(
    useCallback(
      async (formData: UserTokenFormValues) => {
        let response;
        if (formData.application) {
          response = await UsersAPI.createToken(userId, {
            ...formData,
            application: formData.application?.id || null,
          });
        } else {
          response = await TokensAPI.create(formData);
        }

        onSuccessfulAdd(response.data);

        navigate(`/users/${userId}/tokens/${response.data.id}/details`);
      },
      [navigate, userId, onSuccessfulAdd]
    )
  );

  const handleCancel = () => {
    navigate(`/users/${userId}/tokens`);
  };

  return (
    <CardBody>
      <UserTokenForm
        handleCancel={handleCancel}
        handleSubmit={handleSubmit}
        submitError={submitError}
      />
    </CardBody>
  );
}
export default UserTokenAdd;
