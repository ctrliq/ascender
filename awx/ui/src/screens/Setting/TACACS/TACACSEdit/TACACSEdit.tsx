import React from 'react';
import {
  BooleanField,
  ChoiceField,
  EncryptedField,
  InputField,
} from '../../shared/SharedFields';
import { SettingsEditForm } from '../../shared';

function TACACSEdit() {
  return (
    <SettingsEditForm
      category="tacacsplus"
      detailUrl="/settings/tacacs/details"
    >
      {(tacacs) => (
        <>
          <InputField name="TACACSPLUS_HOST" config={tacacs.TACACSPLUS_HOST} />
          <InputField
            name="TACACSPLUS_PORT"
            config={tacacs.TACACSPLUS_PORT}
            type="number"
          />
          <EncryptedField
            name="TACACSPLUS_SECRET"
            config={tacacs.TACACSPLUS_SECRET}
          />
          <InputField
            name="TACACSPLUS_SESSION_TIMEOUT"
            config={tacacs.TACACSPLUS_SESSION_TIMEOUT}
            type="number"
          />
          <ChoiceField
            name="TACACSPLUS_AUTH_PROTOCOL"
            config={tacacs.TACACSPLUS_AUTH_PROTOCOL}
          />
          <BooleanField
            name="TACACSPLUS_REM_ADDR"
            config={tacacs.TACACSPLUS_REM_ADDR}
          />
        </>
      )}
    </SettingsEditForm>
  );
}

export default TACACSEdit;
