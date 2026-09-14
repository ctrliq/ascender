import React from 'react';
import {
  EncryptedField,
  InputField,
  ObjectField,
} from '../../shared/SharedFields';
import { SettingsEditForm } from '../../shared';

function GitHubTeamEdit() {
  return (
    <SettingsEditForm
      category="github-team"
      detailUrl="/settings/github/team/details"
    >
      {(github) => (
        <>
          <InputField
            name="SOCIAL_AUTH_GITHUB_TEAM_KEY"
            config={github.SOCIAL_AUTH_GITHUB_TEAM_KEY}
          />
          <EncryptedField
            name="SOCIAL_AUTH_GITHUB_TEAM_SECRET"
            config={github.SOCIAL_AUTH_GITHUB_TEAM_SECRET}
          />
          <InputField
            name="SOCIAL_AUTH_GITHUB_TEAM_ID"
            config={github.SOCIAL_AUTH_GITHUB_TEAM_ID}
          />
          <ObjectField
            name="SOCIAL_AUTH_GITHUB_TEAM_ORGANIZATION_MAP"
            config={github.SOCIAL_AUTH_GITHUB_TEAM_ORGANIZATION_MAP}
          />
          <ObjectField
            name="SOCIAL_AUTH_GITHUB_TEAM_TEAM_MAP"
            config={github.SOCIAL_AUTH_GITHUB_TEAM_TEAM_MAP}
          />
        </>
      )}
    </SettingsEditForm>
  );
}

export default GitHubTeamEdit;
