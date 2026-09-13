import React from 'react';
import {
  EncryptedField,
  InputField,
  ObjectField,
} from '../../shared/SharedFields';
import { SettingsEditForm } from '../../shared';

function GitHubEnterpriseOrgEdit() {
  return (
    <SettingsEditForm
      category="github-enterprise-org"
      detailUrl="/settings/github/enterprise_organization/details"
    >
      {(github) => (
        <>
          <InputField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_URL"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_URL}
          />
          <InputField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_API_URL"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_API_URL}
          />
          <InputField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_KEY"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_KEY}
          />
          <EncryptedField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_SECRET"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_SECRET}
          />
          <InputField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_NAME"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_NAME}
          />
          <ObjectField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_ORGANIZATION_MAP"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_ORGANIZATION_MAP}
          />
          <ObjectField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_TEAM_MAP"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_TEAM_MAP}
          />
        </>
      )}
    </SettingsEditForm>
  );
}

export default GitHubEnterpriseOrgEdit;
