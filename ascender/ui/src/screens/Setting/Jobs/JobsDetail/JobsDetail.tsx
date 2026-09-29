import type { SettingConfig } from 'types/api';
import React, { useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import { CardBody, CardActionsRow } from 'components/Card';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import { DetailList } from 'components/DetailList';
import useRequest from 'hooks/useRequest';
import { useConfig } from 'contexts/Config';
import { useSettings } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import ResourceTabs from 'components/ResourceTabs';
import { sortNestedDetails } from '../../shared/settingUtils';
import { SettingDetail } from '../../shared';
import { groupFromPath } from '../../shared/settingGroups';
import { GROUPS } from '../groups';

function JobsDetail() {
  const { me } = useConfig();
  const { pathname } = useLocation();
  // The address says which group is open, so a link into one lands on it and
  // the back button walks the tabs as it walks every other tab bar.
  const group = groupFromPath(GROUPS, pathname);
  const { GET: options = {} } = useSettings();
  const { t, i18n } = useLingui();

  const {
    isLoading,
    error,
    request,
    result: jobs,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('jobs');

      const {
        STDOUT_MAX_BYTES_DISPLAY,
        EVENT_STDOUT_MAX_BYTES_DISPLAY,
        ...jobsData
      } = data;

      const mergedData: Record<string, SettingConfig> = {};
      Object.keys(jobsData).forEach((key) => {
        mergedData[key] = { ...options[key], value: jobsData[key] };
      });

      return sortNestedDetails(mergedData);
    }, [options]),
    null
  );

  useEffect(() => {
    request();
  }, [request]);

  return (
    <>
      <ResourceTabs
        aria-label={t`Jobs tabs`}
        ouiaId="jobs-tabs"
        tabs={GROUPS.map(({ id, label }) => ({
          label: i18n._(label),
          path: `/job_settings/${id}`,
        }))}
      />
      <CardBody>
        {isLoading && <ContentLoading />}
        {!isLoading && Boolean(error) && <ContentError error={error} />}
        {!isLoading && jobs && (
          <DetailList>
            {/* In the tab's own order rather than the sorted one the request
                returns, so each group reads as the edit form asks for it. */}
            {group.keys
              .map(
                (key) => [key, jobs.find(([id]) => id === key)?.[1]] as const
              )
              .filter(([, detail]) => Boolean(detail))
              .map(([key, detail]) => (
                <SettingDetail
                  key={key}
                  id={key}
                  helpText={detail?.help_text}
                  label={detail?.label}
                  type={detail?.type}
                  unit={detail?.unit}
                  /* A choice reads as its label rather than the value stored,
                     and Jinja's 'template' as the edit form words it. */
                  choices={
                    detail?.choices?.map(([value, label]) =>
                      key === 'ALLOW_JINJA_IN_EXTRA_VARS' &&
                      value === 'template'
                        ? [value, t`Template`]
                        : [value, label]
                    ) as [string, string][] | undefined
                  }
                  value={detail?.value}
                />
              ))}
          </DetailList>
        )}
        {me?.is_superuser && (
          <CardActionsRow>
            <Button
              ouiaId="jobs-detail-edit-button"
              aria-label={t`Edit`}
              component={Link}
              to={`/job_settings/edit/${group.id}`}
            >
              {t`Edit`}
            </Button>
          </CardActionsRow>
        )}
      </CardBody>
    </>
  );
}

export default JobsDetail;
