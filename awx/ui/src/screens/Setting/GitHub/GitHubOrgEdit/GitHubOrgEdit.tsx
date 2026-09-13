import React from 'react';
import {
  EncryptedField,
  InputField,
  ObjectField,
} from '../../shared/SharedFields';
import { SettingsEditForm } from '../../shared';

function GitHubOrgEdit() {
  return (
    <SettingsEditForm
      category="github-org"
      detailUrl="/settings/github/organization/details"
    >
      {(github) => (
        <>
          <InputField
            name="SOCIAL_AUTH_GITHUB_ORG_KEY"
            config={github.SOCIAL_AUTH_GITHUB_ORG_KEY}
          />
          <EncryptedField
            name="SOCIAL_AUTH_GITHUB_ORG_SECRET"
            config={github.SOCIAL_AUTH_GITHUB_ORG_SECRET}
          />
          <InputField
            name="SOCIAL_AUTH_GITHUB_ORG_NAME"
            config={github.SOCIAL_AUTH_GITHUB_ORG_NAME}
          />
          <ObjectField
            name="SOCIAL_AUTH_GITHUB_ORG_ORGANIZATION_MAP"
            config={github.SOCIAL_AUTH_GITHUB_ORG_ORGANIZATION_MAP}
          />
          <ObjectField
            name="SOCIAL_AUTH_GITHUB_ORG_TEAM_MAP"
            config={github.SOCIAL_AUTH_GITHUB_ORG_TEAM_MAP}
          />
        </>
      )}
    </SettingsEditForm>
  );
}

export default GitHubOrgEdit;
