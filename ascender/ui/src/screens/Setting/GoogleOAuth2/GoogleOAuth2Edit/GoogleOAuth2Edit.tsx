import React from 'react';
import {
  EncryptedField,
  InputField,
  ObjectField,
} from '../../shared/SharedFields';
import { SettingsEditForm } from '../../shared';

function GoogleOAuth2Edit() {
  return (
    <SettingsEditForm
      category="google-oauth2"
      detailUrl="/settings/google_oauth2/details"
    >
      {(googleOAuth2) => (
        <>
          <InputField
            name="SOCIAL_AUTH_GOOGLE_OAUTH2_KEY"
            config={googleOAuth2.SOCIAL_AUTH_GOOGLE_OAUTH2_KEY}
          />
          <EncryptedField
            name="SOCIAL_AUTH_GOOGLE_OAUTH2_SECRET"
            config={googleOAuth2.SOCIAL_AUTH_GOOGLE_OAUTH2_SECRET}
          />
          <ObjectField
            name="SOCIAL_AUTH_GOOGLE_OAUTH2_WHITELISTED_DOMAINS"
            config={googleOAuth2.SOCIAL_AUTH_GOOGLE_OAUTH2_WHITELISTED_DOMAINS}
          />
          <ObjectField
            name="SOCIAL_AUTH_GOOGLE_OAUTH2_AUTH_EXTRA_ARGUMENTS"
            config={googleOAuth2.SOCIAL_AUTH_GOOGLE_OAUTH2_AUTH_EXTRA_ARGUMENTS}
          />
          <ObjectField
            name="SOCIAL_AUTH_GOOGLE_OAUTH2_ORGANIZATION_MAP"
            config={googleOAuth2.SOCIAL_AUTH_GOOGLE_OAUTH2_ORGANIZATION_MAP}
          />
          <ObjectField
            name="SOCIAL_AUTH_GOOGLE_OAUTH2_TEAM_MAP"
            config={googleOAuth2.SOCIAL_AUTH_GOOGLE_OAUTH2_TEAM_MAP}
          />
        </>
      )}
    </SettingsEditForm>
  );
}

export default GoogleOAuth2Edit;
