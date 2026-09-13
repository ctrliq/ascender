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
            name="AWX_CLEANUP_PATHS"
            config={debug.AWX_CLEANUP_PATHS}
          />
          <BooleanField
            name="AWX_REQUEST_PROFILE"
            config={debug.AWX_REQUEST_PROFILE}
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
