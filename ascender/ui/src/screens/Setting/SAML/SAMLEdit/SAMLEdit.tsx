import React from 'react';
import {
  BooleanField,
  FileUploadField,
  InputField,
  ObjectField,
} from '../../shared/SharedFields';
import { SettingsEditForm } from '../../shared';

function SAMLEdit() {
  return (
    <SettingsEditForm category="saml" detailUrl="/settings/saml/details">
      {(saml) => (
        <>
          <InputField
            name="SOCIAL_AUTH_SAML_SP_ENTITY_ID"
            config={saml.SOCIAL_AUTH_SAML_SP_ENTITY_ID}
            isRequired
          />
          <BooleanField
            name="SAML_AUTO_CREATE_OBJECTS"
            config={saml.SAML_AUTO_CREATE_OBJECTS}
          />
          <FileUploadField
            name="SOCIAL_AUTH_SAML_SP_PUBLIC_CERT"
            config={saml.SOCIAL_AUTH_SAML_SP_PUBLIC_CERT}
            isRequired
          />
          <FileUploadField
            name="SOCIAL_AUTH_SAML_SP_PRIVATE_KEY"
            config={saml.SOCIAL_AUTH_SAML_SP_PRIVATE_KEY}
            isRequired
          />
          <ObjectField
            name="SOCIAL_AUTH_SAML_ORG_INFO"
            config={saml.SOCIAL_AUTH_SAML_ORG_INFO}
          />
          <ObjectField
            name="SOCIAL_AUTH_SAML_TECHNICAL_CONTACT"
            config={saml.SOCIAL_AUTH_SAML_TECHNICAL_CONTACT}
          />
          <ObjectField
            name="SOCIAL_AUTH_SAML_SUPPORT_CONTACT"
            config={saml.SOCIAL_AUTH_SAML_SUPPORT_CONTACT}
          />
          <ObjectField
            name="SOCIAL_AUTH_SAML_ENABLED_IDPS"
            config={saml.SOCIAL_AUTH_SAML_ENABLED_IDPS}
          />
          <ObjectField
            name="SOCIAL_AUTH_SAML_ORGANIZATION_MAP"
            config={saml.SOCIAL_AUTH_SAML_ORGANIZATION_MAP}
          />
          <ObjectField
            name="SOCIAL_AUTH_SAML_ORGANIZATION_ATTR"
            config={saml.SOCIAL_AUTH_SAML_ORGANIZATION_ATTR}
          />
          <ObjectField
            name="SOCIAL_AUTH_SAML_TEAM_MAP"
            config={saml.SOCIAL_AUTH_SAML_TEAM_MAP}
          />
          <ObjectField
            name="SOCIAL_AUTH_SAML_TEAM_ATTR"
            config={saml.SOCIAL_AUTH_SAML_TEAM_ATTR}
          />
          <ObjectField
            name="SOCIAL_AUTH_SAML_USER_FLAGS_BY_ATTR"
            config={saml.SOCIAL_AUTH_SAML_USER_FLAGS_BY_ATTR}
          />
          <ObjectField
            name="SOCIAL_AUTH_SAML_SECURITY_CONFIG"
            config={saml.SOCIAL_AUTH_SAML_SECURITY_CONFIG}
          />
          <ObjectField
            name="SOCIAL_AUTH_SAML_SP_EXTRA"
            config={saml.SOCIAL_AUTH_SAML_SP_EXTRA}
          />
          <ObjectField
            name="SOCIAL_AUTH_SAML_EXTRA_DATA"
            config={saml.SOCIAL_AUTH_SAML_EXTRA_DATA}
          />
        </>
      )}
    </SettingsEditForm>
  );
}

export default SAMLEdit;
