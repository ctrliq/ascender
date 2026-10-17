import React from 'react';
import { useLingui } from '@lingui/react/macro';
import {
  BooleanField,
  InputAlertField,
  InputField,
  SettingsEditForm,
} from '../../shared';
import { SESSION_KEYS } from '../keys';

/** How a session begins, how long it lasts, and what needs none. */
function MiscAuthenticationEdit() {
  const { t } = useLingui();

  return (
    <SettingsEditForm
      category="authentication"
      detailUrl="/authentication/session/details"
      only={SESSION_KEYS}
    >
      {(authentication) => (
        <>
          <InputField
            name="SESSION_COOKIE_AGE"
            config={authentication.SESSION_COOKIE_AGE}
            type="number"
            isRequired
          />
          <InputField
            name="SESSIONS_PER_USER"
            config={authentication.SESSIONS_PER_USER}
            type="number"
            isRequired
          />
          <BooleanField
            name="DISABLE_LOCAL_AUTH"
            needsConfirmationModal
            modalTitle={t`Confirm Disable Local Authentication`}
            config={authentication.DISABLE_LOCAL_AUTH}
          />
          <BooleanField
            name="AUTH_BASIC_ENABLED"
            config={authentication.AUTH_BASIC_ENABLED}
          />
          <InputAlertField
            name="LOGIN_REDIRECT_OVERRIDE"
            config={authentication.LOGIN_REDIRECT_OVERRIDE}
          />
          {/* The detail has always shown this and the form never offered it,
              though the api takes it: a setting a reader can see and not
              change reads as a bug in the page. */}
          <BooleanField
            name="ALLOW_METRICS_FOR_ANONYMOUS_USERS"
            config={authentication.ALLOW_METRICS_FOR_ANONYMOUS_USERS}
          />
        </>
      )}
    </SettingsEditForm>
  );
}

export default MiscAuthenticationEdit;
