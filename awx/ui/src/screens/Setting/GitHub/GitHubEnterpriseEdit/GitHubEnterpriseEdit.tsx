import React from 'react';
import {
  EncryptedField,
  InputField,
  ObjectField,
} from '../../shared/SharedFields';
import { SettingsEditForm } from '../../shared';

function GitHubEnterpriseEdit() {
  return (
    <SettingsEditForm
      category="github-enterprise"
      detailUrl="/settings/github/enterprise/details"
    >
      {(github) => (
        <>
          <InputField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_URL"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_URL}
          />
          <InputField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_API_URL"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_API_URL}
          />
          <InputField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_KEY"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_KEY}
          />
          <EncryptedField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_SECRET"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_SECRET}
          />
          <ObjectField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_ORGANIZATION_MAP"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_ORGANIZATION_MAP}
          />
          <ObjectField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_MAP"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_MAP}
          />
        </>
      )}
    </SettingsEditForm>
  );
}

export default GitHubEnterpriseEdit;
