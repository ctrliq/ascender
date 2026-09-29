import React from 'react';
import { BooleanField, ObjectField, SettingsEditForm } from '../../shared';
import { MAPPING_KEYS } from '../keys';

/**
 * What a provider's answer becomes here.
 *
 * Authentication Backends is among the settings this reads and has no field:
 * the api sends it read only, so the form has nothing to offer for it.
 */
function MappingEdit() {
  return (
    <SettingsEditForm
      category="authentication"
      detailUrl="/authentication/mapping/details"
      only={MAPPING_KEYS}
    >
      {(authentication) => (
        <>
          <BooleanField
            name="SOCIAL_AUTH_USERNAME_IS_FULL_EMAIL"
            config={authentication.SOCIAL_AUTH_USERNAME_IS_FULL_EMAIL}
          />
          <ObjectField
            name="SOCIAL_AUTH_ORGANIZATION_MAP"
            config={authentication.SOCIAL_AUTH_ORGANIZATION_MAP}
          />
          <ObjectField
            name="SOCIAL_AUTH_TEAM_MAP"
            config={authentication.SOCIAL_AUTH_TEAM_MAP}
          />
          <ObjectField
            name="SOCIAL_AUTH_USER_FIELDS"
            config={authentication.SOCIAL_AUTH_USER_FIELDS}
          />
        </>
      )}
    </SettingsEditForm>
  );
}

export default MappingEdit;
