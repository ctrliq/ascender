import React from 'react';
import {
  EncryptedField,
  InputField,
  ObjectField,
} from '../../shared/SharedFields';
import { SettingsEditForm } from '../../shared';

function GitHubEdit() {
  return (
    <SettingsEditForm category="github" detailUrl="/settings/github/details">
      {(github) => (
        <>
          <InputField
            name="SOCIAL_AUTH_GITHUB_KEY"
            config={github.SOCIAL_AUTH_GITHUB_KEY}
          />
          <EncryptedField
            name="SOCIAL_AUTH_GITHUB_SECRET"
            config={github.SOCIAL_AUTH_GITHUB_SECRET}
          />
          <ObjectField
            name="SOCIAL_AUTH_GITHUB_ORGANIZATION_MAP"
            config={github.SOCIAL_AUTH_GITHUB_ORGANIZATION_MAP}
          />
          <ObjectField
            name="SOCIAL_AUTH_GITHUB_TEAM_MAP"
            config={github.SOCIAL_AUTH_GITHUB_TEAM_MAP}
          />
        </>
      )}
    </SettingsEditForm>
  );
}

export default GitHubEdit;
