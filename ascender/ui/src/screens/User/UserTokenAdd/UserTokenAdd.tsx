import type { OAuth2Token, SummaryFieldRef } from 'types/api';
import React, { useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';

import { CardBody } from 'components/Card';
import { TokensAPI, UsersAPI } from 'api';
import useRequest from 'hooks/useRequest';
import UserTokenForm from '../shared/UserTokenForm';
import type { UserTokenFormValues } from '../shared/UserTokenForm';

export interface UserTokenAddProps {
  /**
   * Hands the new token up so it can be shown once, in the clear, and says
   * where to go once that has been read, where it is not the token's details.
   */
  onSuccessfulAdd: (token: OAuth2Token, returnTo?: string) => void;
}

function UserTokenAdd({ onSuccessfulAdd }: UserTokenAddProps) {
  const navigate = useNavigate();
  const { id: userId } = useParams() as { id: string };
  /*
   * An application's Tokens tab sends its application along, so the token is
   * made for it without the reader picking it again, and Cancel goes back to
   * that tab rather than to the user's own tokens.
   */
  const { state } = useLocation() as {
    state?: { application?: SummaryFieldRef } | null;
  };
  const application = state?.application ?? null;
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

        /*
         * From an application's Tokens tab the reader goes back there, but only
         * once the token has been shown: the value is shown this once and
         * never again, so it is not carried across the navigation, it is
         * shown here and the way back is taken when its dialog closes.
         */
        if (application) {
          onSuccessfulAdd(
            response.data,
            `/applications/${application.id}/tokens`
          );
          return;
        }
        onSuccessfulAdd(response.data);

        navigate(`/users/${userId}/tokens/${response.data.id}/details`);
      },
      [navigate, userId, onSuccessfulAdd, application]
    )
  );

  const handleCancel = () => {
    navigate(
      application
        ? `/applications/${application.id}/tokens`
        : `/users/${userId}/tokens`
    );
  };

  return (
    <CardBody>
      <UserTokenForm
        token={application ? { summary_fields: { application } } : undefined}
        handleCancel={handleCancel}
        handleSubmit={handleSubmit}
        submitError={submitError}
      />
    </CardBody>
  );
}
export default UserTokenAdd;
