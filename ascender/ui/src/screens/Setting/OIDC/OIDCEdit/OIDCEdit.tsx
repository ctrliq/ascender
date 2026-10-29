import React from 'react';
import {
  EncryptedField,
  InputField,
  BooleanField,
  ObjectField,
} from '../../shared/SharedFields';
import { SettingsEditForm } from '../../shared';

function OIDCEdit() {
  return (
    <SettingsEditForm category="oidc" detailUrl="/authentication/oidc/details">
      {(OIDC) => (
        <>
          <InputField
            name="SOCIAL_AUTH_OIDC_KEY"
            config={OIDC.SOCIAL_AUTH_OIDC_KEY}
          />
          <EncryptedField
            name="SOCIAL_AUTH_OIDC_SECRET"
            config={OIDC.SOCIAL_AUTH_OIDC_SECRET}
          />
          <InputField
            name="SOCIAL_AUTH_OIDC_OIDC_ENDPOINT"
            config={OIDC.SOCIAL_AUTH_OIDC_OIDC_ENDPOINT}
            type="url"
          />
          <BooleanField
            name="SOCIAL_AUTH_OIDC_VERIFY_SSL"
            config={OIDC.SOCIAL_AUTH_OIDC_VERIFY_SSL}
          />
          <InputField
            name="SOCIAL_AUTH_OIDC_USERNAME_KEY"
            config={OIDC.SOCIAL_AUTH_OIDC_USERNAME_KEY}
          />
          <BooleanField
            name="SOCIAL_AUTH_OIDC_USERNAME_STRIP_DOMAIN"
            config={OIDC.SOCIAL_AUTH_OIDC_USERNAME_STRIP_DOMAIN}
          />
          <InputField
            name="SOCIAL_AUTH_OIDC_GROUPS_CLAIM"
            config={OIDC.SOCIAL_AUTH_OIDC_GROUPS_CLAIM}
          />
          <BooleanField
            name="SOCIAL_AUTH_OIDC_LOGOUT_FROM_IDP"
            config={OIDC.SOCIAL_AUTH_OIDC_LOGOUT_FROM_IDP}
          />
          <InputField
            name="SOCIAL_AUTH_OIDC_POST_LOGOUT_REDIRECT_URL"
            config={OIDC.SOCIAL_AUTH_OIDC_POST_LOGOUT_REDIRECT_URL}
            type="url"
          />
          <ObjectField
            name="SOCIAL_AUTH_OIDC_SCOPE"
            config={OIDC.SOCIAL_AUTH_OIDC_SCOPE}
          />
          <ObjectField
            name="SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS"
            config={OIDC.SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS}
          />
          <ObjectField
            name="SOCIAL_AUTH_OIDC_ORGANIZATION_MAP"
            config={OIDC.SOCIAL_AUTH_OIDC_ORGANIZATION_MAP}
          />
          <ObjectField
            name="SOCIAL_AUTH_OIDC_TEAM_MAP"
            config={OIDC.SOCIAL_AUTH_OIDC_TEAM_MAP}
          />
          <ObjectField
            name="SOCIAL_AUTH_OIDC_USER_FLAGS"
            config={OIDC.SOCIAL_AUTH_OIDC_USER_FLAGS}
          />
        </>
      )}
    </SettingsEditForm>
  );
}

export default OIDCEdit;
