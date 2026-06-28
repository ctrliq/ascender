import React, { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';

import { CardBody } from 'components/Card';
import { TokensAPI, UsersAPI } from 'api';
import useRequest from 'hooks/useRequest';
import UserTokenForm from '../shared/UserTokenForm';

function UserTokenAdd({ onSuccessfulAdd }) {
  const navigate = useNavigate();
  const { id: userId } = useParams();
  const { error: submitError, request: handleSubmit } = useRequest(
    useCallback(
      async (formData) => {
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
