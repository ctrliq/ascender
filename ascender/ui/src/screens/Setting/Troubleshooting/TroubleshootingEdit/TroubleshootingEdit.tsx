import React from 'react';
import { BooleanField, SettingsEditForm } from '../../shared';

function TroubleshootingEdit() {
  return (
    <SettingsEditForm
      category="debug"
      detailUrl="/settings/troubleshooting/details"
    >
      {(debug) => (
        <>
          <BooleanField
            name="ASCENDER_CLEANUP_PATHS"
            config={debug.ASCENDER_CLEANUP_PATHS}
          />
          <BooleanField
            name="ASCENDER_REQUEST_PROFILE"
            config={debug.ASCENDER_REQUEST_PROFILE}
          />
          <BooleanField
            name="RECEPTOR_RELEASE_WORK"
            config={debug.RECEPTOR_RELEASE_WORK}
          />
        </>
      )}
    </SettingsEditForm>
  );
}

export default TroubleshootingEdit;
