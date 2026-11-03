import React, { useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import ResourceTabs from 'components/ResourceTabs';
import { CardBody, CardActionsRow } from 'components/Card';
import ContentLoading from 'components/ContentLoading';
import ContentError from 'components/ContentError';
import { SettingsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import { DetailList } from 'components/DetailList';
import { useConfig } from 'contexts/Config';
import { useSettings } from 'contexts/Settings';
import { pluck } from '../../shared/settingUtils';
import { SettingDetail } from '../../shared';
import { groupFromPath } from '../../shared/settingGroups';
import { GROUPS } from '../groups';

function UIDetail() {
  const { t, i18n } = useLingui();
  const { me } = useConfig();
  // The API names a setting after what it holds; where the field takes a file
  // rather than a value, the label says so.
  const FIELD_LABELS: Record<string, string> = {
    CUSTOM_THEME: t`Custom Theme CSS File`,
  };
  const { GET: options = {} } = useSettings();
  const { pathname, state: locationState } = useLocation();
  // The open tab lives in the address, so the edit form can send a reader
  // back to the tab they edited and a reload after a revert lands there too.
  const activeGroup = groupFromPath(GROUPS, pathname).id;
  const hardReload = locationState?.hardReload;

  useEffect(() => {
    if (hardReload) {
      // Clear the hardReload flag from history state before reloading so that
      // the post-reload render doesn't see it again and trigger the reload
      // over and over (infinite loop).
      window.history.replaceState(null, '');
      window.location.reload();
    }
  }, [hardReload]);

  const {
    isLoading,
    error,
    request,
    result: ui,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('ui');

      const uiData = pluck(
        data,
        // The browser title leads, as it does on the edit screen: it is the
        // shortest setting here and the one that names the installation.
        'CUSTOM_TITLE',
        'CUSTOM_LOGIN_INFO',
        'CUSTOM_LOGO',
        'CUSTOM_HEADER_LOGO',
        // The stylesheet is a whole file, which reads as a wall of text in a
        // detail cell, so the row below says whether one is in place rather
        // than printing it.
        'CUSTOM_THEME',
        'CUSTOM_THEME_NAME',
        'DEFAULT_UI_THEME',
        'DEFAULT_UI_LANGUAGE',
        'UI_LIVE_UPDATES_ENABLED',
        'MAX_UI_JOB_EVENTS',
        'MAX_UI_EDITOR_ROWS'
      );

      return uiData;
    }, []),
    null
  );

  useEffect(() => {
    request();
  }, [request]);

  // Change CUSTOM_LOGO / CUSTOM_HEADER_LOGO type from string to image
  // to help SettingDetail render it as an <img>
  if (options?.CUSTOM_LOGO) {
    options.CUSTOM_LOGO.type = 'image';
  }
  if (options?.CUSTOM_HEADER_LOGO) {
    options.CUSTOM_HEADER_LOGO.type = 'image';
  }

  return (
    <>
      <ResourceTabs
        aria-label={t`Appearance tabs`}
        ouiaId="appearance-tabs"
        tabs={GROUPS.map(({ id, label }) => ({
          label: i18n._(label),
          path: `/appearance/${id}`,
        }))}
      />
      <CardBody>
        {isLoading && <ContentLoading />}
        {!isLoading && Boolean(error) && <ContentError error={error} />}
        {!isLoading && ui && (
          <DetailList>
            {(GROUPS.find(({ id }) => id === activeGroup)?.keys ?? [])
              .filter((key) => key in (ui as Record<string, unknown>))
              .map((key) => {
                const record = options?.[key];
                return (
                  <SettingDetail
                    key={key}
                    id={key}
                    helpText={record?.help_text}
                    label={FIELD_LABELS[key] ?? record?.label}
                    type={record?.type}
                    unit={record?.unit}
                    choices={record?.choices as [string, string][] | undefined}
                    /* The stylesheet itself would fill the tab, so the row
                       says that one is in place and leaves the reading of it
                       to the edit screen. Empty reads as not configured, the
                       way every other unset setting does. */
                    value={
                      key === 'CUSTOM_THEME'
                        ? ui?.[key] && t`Uploaded`
                        : ui?.[key]
                    }
                  />
                );
              })}
          </DetailList>
        )}
        {me?.is_superuser && (
          <CardActionsRow>
            <Button
              aria-label={t`Edit`}
              component={Link}
              to={`/appearance/edit/${activeGroup}`}
              ouiaId="ui-detail-edit-button"
            >
              {t`Edit`}
            </Button>
          </CardActionsRow>
        )}
      </CardBody>
    </>
  );
}

export default UIDetail;
