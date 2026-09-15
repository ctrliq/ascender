import React from 'react';
import {
  EncryptedField,
  InputField,
  ObjectField,
} from '../../shared/SharedFields';
import { SettingsEditForm } from '../../shared';

function AzureADEdit() {
  return (
    <SettingsEditForm
      category="azuread-oauth2"
      detailUrl="/settings/azure/default/details"
    >
      {(azure) => (
        <>
          <InputField
            name="SOCIAL_AUTH_AZUREAD_OAUTH2_KEY"
            config={azure.SOCIAL_AUTH_AZUREAD_OAUTH2_KEY}
          />
          <EncryptedField
            name="SOCIAL_AUTH_AZUREAD_OAUTH2_SECRET"
            config={azure.SOCIAL_AUTH_AZUREAD_OAUTH2_SECRET}
          />
          <ObjectField
            name="SOCIAL_AUTH_AZUREAD_OAUTH2_ORGANIZATION_MAP"
            config={azure.SOCIAL_AUTH_AZUREAD_OAUTH2_ORGANIZATION_MAP}
          />
          <ObjectField
            name="SOCIAL_AUTH_AZUREAD_OAUTH2_TEAM_MAP"
            config={azure.SOCIAL_AUTH_AZUREAD_OAUTH2_TEAM_MAP}
          />
        </>
      )}
    </SettingsEditForm>
  );
}

export default AzureADEdit;
