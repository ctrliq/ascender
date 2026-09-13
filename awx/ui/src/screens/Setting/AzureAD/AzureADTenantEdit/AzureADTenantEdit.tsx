import React from 'react';
import {
  EncryptedField,
  InputField,
  ObjectField,
} from '../../shared/SharedFields';
import { SettingsEditForm } from '../../shared';

function AzureADTenantEdit() {
  return (
    <SettingsEditForm
      category="azuread-oauth2-tenant"
      detailUrl="/settings/azure/tenant/details"
    >
      {(azureTenant) => (
        <>
          <InputField
            name="SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_KEY"
            config={azureTenant.SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_KEY}
          />
          <EncryptedField
            name="SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_SECRET"
            config={azureTenant.SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_SECRET}
          />
          <InputField
            name="SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_TENANT_ID"
            config={azureTenant.SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_TENANT_ID}
          />
          <ObjectField
            name="SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_ORGANIZATION_MAP"
            config={
              azureTenant.SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_ORGANIZATION_MAP
            }
          />
          <ObjectField
            name="SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_TEAM_MAP"
            config={azureTenant.SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_TEAM_MAP}
          />
        </>
      )}
    </SettingsEditForm>
  );
}

export default AzureADTenantEdit;
