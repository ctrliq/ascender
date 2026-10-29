import React from 'react';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import ResourceTabs from 'components/ResourceTabs';
import { BooleanField, SettingsEditForm } from '../../shared';
import { groupFromPath } from '../../shared/settingGroups';
import { GROUPS } from '../groups';

function TroubleshootingEdit() {
  const { t, i18n } = useLingui();
  const { pathname } = useLocation();
  // The tab being edited, which is the only group this form shows: a field
  // whose setting is not in the group has no configuration to render from,
  // and a field that renders nothing still registers what it would validate.
  const group = groupFromPath(GROUPS, pathname);

  return (
    <>
      {/* As on the detail: one group needs no bar to pick it from. */}
      {GROUPS.length > 1 && (
        <ResourceTabs
          aria-label={t`Troubleshooting tabs`}
          ouiaId="troubleshooting-edit-tabs"
          tabs={GROUPS.map(({ id, label }) => ({
            label: i18n._(label),
            path: `/troubleshooting/edit/${id}`,
          }))}
        />
      )}
      <SettingsEditForm
        category="debug"
        detailUrl={`/troubleshooting/${group.id}`}
        only={group.keys}
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
    </>
  );
}

export default TroubleshootingEdit;
