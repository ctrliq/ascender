import React from 'react';
import {
  EncryptedField,
  InputField,
  ObjectField,
} from '../../shared/SharedFields';
import { SettingsEditForm } from '../../shared';

function GitHubEnterpriseTeamEdit() {
  return (
    <SettingsEditForm
      category="github-enterprise-team"
      detailUrl="/settings/github/enterprise_team/details"
    >
      {(github) => (
        <>
          <InputField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_URL"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_URL}
          />
          <InputField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_API_URL"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_API_URL}
          />
          <InputField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_KEY"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_KEY}
          />
          <EncryptedField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_SECRET"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_SECRET}
          />
          <InputField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_ID"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_ID}
          />
          <ObjectField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_ORGANIZATION_MAP"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_ORGANIZATION_MAP}
          />
          <ObjectField
            name="SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_TEAM_MAP"
            config={github.SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_TEAM_MAP}
          />
        </>
      )}
    </SettingsEditForm>
  );
}

export default GitHubEnterpriseTeamEdit;
