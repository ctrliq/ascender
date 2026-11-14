import type { SettingConfig } from 'types/api';
import React, { useEffect, useCallback } from 'react';
import { Link, Navigate, useMatch } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import { CardBody, CardActionsRow } from 'components/Card';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import { DetailList } from 'components/DetailList';
import { SettingsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import { useConfig } from 'contexts/Config';
import { useSettings } from 'contexts/Settings';
import { SettingDetail } from '../../shared';
import { sortNestedDetails } from '../../shared/settingUtils';

/** The settings of one LDAP server, which are the ones its keys start with. */
function filterByPrefix(
  data: Record<string, SettingConfig>,
  prefix: string
): Record<string, SettingConfig> {
  return Object.keys(data)
    .filter((key) => key.includes(prefix))
    .reduce(
      (obj, key) => {
        const setting = data[key];
        if (setting) {
          obj[key] = setting;
        }
        return obj;
      },
      {} as Record<string, SettingConfig>
    );
}

function LDAPDetail() {
  const { t } = useLingui();
  const { me } = useConfig();
  const { GET: options = {} } = useSettings();
  const category = useMatch('/authentication/ldap/:category/details')?.params
    ?.category as string;

  const {
    isLoading,
    error,
    request,
    result: LDAPDetails,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('ldap');

      const mergedData: Record<string, SettingConfig> = {};
      Object.keys(data).forEach((key) => {
        if (key.includes('_CONNECTION_OPTIONS')) {
          return;
        }
        mergedData[key] = { ...options[key], value: data[key] };
      });

      const ldap1 = filterByPrefix(mergedData, 'AUTH_LDAP_1_');
      const ldap2 = filterByPrefix(mergedData, 'AUTH_LDAP_2_');
      const ldap3 = filterByPrefix(mergedData, 'AUTH_LDAP_3_');
      const ldap4 = filterByPrefix(mergedData, 'AUTH_LDAP_4_');
      const ldap5 = filterByPrefix(mergedData, 'AUTH_LDAP_5_');
      const ldapDefault = { ...mergedData };
      Object.keys({ ...ldap1, ...ldap2, ...ldap3, ...ldap4, ...ldap5 }).forEach(
        (keyToOmit) => {
          delete ldapDefault[keyToOmit];
        }
      );

      return {
        default: sortNestedDetails(ldapDefault),
        1: sortNestedDetails(ldap1),
        2: sortNestedDetails(ldap2),
        3: sortNestedDetails(ldap3),
        4: sortNestedDetails(ldap4),
        5: sortNestedDetails(ldap5),
      };
    }, [options]),
    // Null until the request lands, which is what the render below tests
    // for before it reaches into any of them.
    {
      default: null,
      1: null,
      2: null,
      3: null,
      4: null,
      5: null,
    } as Record<string, [string, SettingConfig][] | null>
  );

  useEffect(() => {
    request();
  }, [request]);

  const baseURL = '/authentication/ldap';

  if (!Object.keys(LDAPDetails).includes(category)) {
    return <Navigate to={`${baseURL}/default/details`} replace />;
  }

  return (
    <CardBody>
      <>
        {isLoading && <ContentLoading />}
        {!isLoading && Boolean(error) && <ContentError error={error} />}
        {!isLoading && !Object.values(LDAPDetails)?.includes(null) && (
          <DetailList>
            {LDAPDetails[category]?.map(([key, detail]) => (
              <SettingDetail
                key={key}
                id={key}
                helpText={detail?.help_text}
                label={detail?.label}
                type={detail?.type}
                unit={detail?.unit}
                value={detail?.value}
              />
            ))}
          </DetailList>
        )}
      </>
      {me?.is_superuser && (
        <CardActionsRow>
          <Button
            ouiaId="ldap-detail-edit-button"
            aria-label={t`Edit`}
            component={Link}
            to={`${baseURL}/${category}/edit`}
          >
            {t`Edit`}
          </Button>
        </CardActionsRow>
      )}
    </CardBody>
  );
}

export default LDAPDetail;
