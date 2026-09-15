import React from 'react';
import { EncryptedField, InputField } from '../../shared/SharedFields';
import { SettingsEditForm } from '../../shared';

function RADIUSEdit() {
  return (
    <SettingsEditForm category="radius" detailUrl="/settings/radius/details">
      {(radius) => (
        <>
          <InputField name="RADIUS_SERVER" config={radius.RADIUS_SERVER} />
          <InputField name="RADIUS_PORT" config={radius.RADIUS_PORT} />
          <EncryptedField name="RADIUS_SECRET" config={radius.RADIUS_SECRET} />
        </>
      )}
    </SettingsEditForm>
  );
}

export default RADIUSEdit;
