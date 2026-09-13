import React from 'react';
import {
  EncryptedField,
  InputField,
  BooleanField,
} from '../../shared/SharedFields';
import { SettingsEditForm } from '../../shared';

function OIDCEdit() {
  return (
    <SettingsEditForm category="oidc" detailUrl="/settings/oidc/details">
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
        </>
      )}
    </SettingsEditForm>
  );
}

export default OIDCEdit;
