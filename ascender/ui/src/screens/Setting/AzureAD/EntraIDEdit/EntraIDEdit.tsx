import React from 'react';
import {
  EncryptedField,
  InputField,
  BooleanField,
  ObjectField,
} from '../../shared/SharedFields';
import { SettingsEditForm } from '../../shared';

function EntraIDEdit() {
  return (
    <SettingsEditForm
      category="entra-id"
      detailUrl="/settings/azure/entra/details"
    >
      {(entra) => (
        <>
          <InputField
            name="SOCIAL_AUTH_ENTRA_ID_KEY"
            config={entra.SOCIAL_AUTH_ENTRA_ID_KEY}
          />
          <EncryptedField
            name="SOCIAL_AUTH_ENTRA_ID_SECRET"
            config={entra.SOCIAL_AUTH_ENTRA_ID_SECRET}
          />
          <InputField
            name="SOCIAL_AUTH_ENTRA_ID_TENANT_ID"
            config={entra.SOCIAL_AUTH_ENTRA_ID_TENANT_ID}
          />
          <InputField
            name="SOCIAL_AUTH_ENTRA_ID_AUTHORITY_HOST"
            config={entra.SOCIAL_AUTH_ENTRA_ID_AUTHORITY_HOST}
          />
          <InputField
            name="SOCIAL_AUTH_ENTRA_ID_USERNAME_KEY"
            config={entra.SOCIAL_AUTH_ENTRA_ID_USERNAME_KEY}
          />
          <BooleanField
            name="SOCIAL_AUTH_ENTRA_ID_USERNAME_STRIP_DOMAIN"
            config={entra.SOCIAL_AUTH_ENTRA_ID_USERNAME_STRIP_DOMAIN}
          />
          <InputField
            name="SOCIAL_AUTH_ENTRA_ID_GROUPS_CLAIM"
            config={entra.SOCIAL_AUTH_ENTRA_ID_GROUPS_CLAIM}
          />
          <BooleanField
            name="SOCIAL_AUTH_ENTRA_ID_GROUPS_FROM_GRAPH"
            config={entra.SOCIAL_AUTH_ENTRA_ID_GROUPS_FROM_GRAPH}
          />
          <InputField
            name="SOCIAL_AUTH_ENTRA_ID_GRAPH_HOST"
            config={entra.SOCIAL_AUTH_ENTRA_ID_GRAPH_HOST}
          />
          <BooleanField
            name="SOCIAL_AUTH_ENTRA_ID_LOGOUT_FROM_IDP"
            config={entra.SOCIAL_AUTH_ENTRA_ID_LOGOUT_FROM_IDP}
          />
          <InputField
            name="SOCIAL_AUTH_ENTRA_ID_POST_LOGOUT_REDIRECT_URL"
            config={entra.SOCIAL_AUTH_ENTRA_ID_POST_LOGOUT_REDIRECT_URL}
            type="url"
          />
          <ObjectField
            name="SOCIAL_AUTH_ENTRA_ID_LOGIN_TRIGGERS"
            config={entra.SOCIAL_AUTH_ENTRA_ID_LOGIN_TRIGGERS}
          />
          <ObjectField
            name="SOCIAL_AUTH_ENTRA_ID_ORGANIZATION_MAP"
            config={entra.SOCIAL_AUTH_ENTRA_ID_ORGANIZATION_MAP}
          />
          <ObjectField
            name="SOCIAL_AUTH_ENTRA_ID_TEAM_MAP"
            config={entra.SOCIAL_AUTH_ENTRA_ID_TEAM_MAP}
          />
          <ObjectField
            name="SOCIAL_AUTH_ENTRA_ID_USER_FLAGS"
            config={entra.SOCIAL_AUTH_ENTRA_ID_USER_FLAGS}
          />
        </>
      )}
    </SettingsEditForm>
  );
}

export default EntraIDEdit;
