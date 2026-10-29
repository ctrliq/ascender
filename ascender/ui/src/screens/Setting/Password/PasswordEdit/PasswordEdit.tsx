import React from 'react';
import { InputField, SettingsEditForm } from '../../shared';
import { PASSWORD_KEYS } from '../keys';

/** The rules a local account's password has to meet. */
function PasswordEdit() {
  return (
    <SettingsEditForm
      category="authentication"
      detailUrl="/authentication/password/details"
      only={PASSWORD_KEYS}
    >
      {(authentication) => (
        <>
          <InputField
            name="LOCAL_PASSWORD_MIN_LENGTH"
            config={authentication.LOCAL_PASSWORD_MIN_LENGTH}
            type="number"
            isRequired
          />
          <InputField
            name="LOCAL_PASSWORD_MIN_DIGITS"
            config={authentication.LOCAL_PASSWORD_MIN_DIGITS}
            type="number"
            isRequired
          />
          <InputField
            name="LOCAL_PASSWORD_MIN_UPPER"
            config={authentication.LOCAL_PASSWORD_MIN_UPPER}
            type="number"
            isRequired
          />
          <InputField
            name="LOCAL_PASSWORD_MIN_SPECIAL"
            config={authentication.LOCAL_PASSWORD_MIN_SPECIAL}
            type="number"
            isRequired
          />
        </>
      )}
    </SettingsEditForm>
  );
}

export default PasswordEdit;
