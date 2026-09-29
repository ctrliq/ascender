import React, { useEffect, useCallback } from 'react';
import { Link, Navigate, useMatch } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import { CardBody, CardActionsRow } from 'components/Card';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import { DetailList } from 'components/DetailList';
import { useConfig } from 'contexts/Config';
import { useSettings } from 'contexts/Settings';
import useRequest from 'hooks/useRequest';
import { SettingsAPI } from 'api';
import { SettingDetail } from '../../shared';

function GitHubDetail() {
  const { t } = useLingui();
  const { me } = useConfig();
  const { GET: options = {} } = useSettings();

  const baseURL = '/authentication/github';
  const category = useMatch(`${baseURL}/:category/details`)?.params
    ?.category as string;

  const {
    isLoading,
    error,
    request,
    result: gitHubDetails,
  } = useRequest(
    useCallback(async () => {
      const [
        { data: gitHubDefault },
        { data: gitHubOrganization },
        { data: gitHubTeam },
        { data: gitHubEnterprise },
        { data: gitHubEnterpriseOrganization },
        { data: gitHubEnterpriseTeam },
      ] = await Promise.all([
        SettingsAPI.readCategory('github'),
        SettingsAPI.readCategory('github-org'),
        SettingsAPI.readCategory('github-team'),
        SettingsAPI.readCategory('github-enterprise'),
        SettingsAPI.readCategory('github-enterprise-org'),
        SettingsAPI.readCategory('github-enterprise-team'),
      ]);
      return {
        default: gitHubDefault,
        organization: gitHubOrganization,
        team: gitHubTeam,
        enterprise: gitHubEnterprise,
        enterprise_organization: gitHubEnterpriseOrganization,
        enterprise_team: gitHubEnterpriseTeam,
      };
    }, []),
    {
      default: null,
      organization: null,
      team: null,
      enterprise: null,
      enterprise_organization: null,
      enterprise_team: null,
    }
  );

  useEffect(() => {
    request();
  }, [request]);

  if (!Object.keys(gitHubDetails).includes(category)) {
    return <Navigate to={`${baseURL}/default/details`} replace />;
  }

  return (
    <CardBody>
      {isLoading && <ContentLoading />}
      {!isLoading && Boolean(error) && <ContentError error={error} />}
      {!isLoading && Object.values(gitHubDetails).every(Boolean) && (
        <DetailList>
          {Object.keys(
            gitHubDetails[category as keyof typeof gitHubDetails]
          ).map((key) => {
            const record = options?.[key];
            return (
              <SettingDetail
                key={key}
                id={key}
                helpText={record?.help_text}
                label={record?.label}
                type={record?.type}
                unit={record?.unit}
                value={
                  gitHubDetails[category as keyof typeof gitHubDetails][key]
                }
              />
            );
          })}
        </DetailList>
      )}
      {me?.is_superuser && (
        <CardActionsRow>
          <Button
            ouiaId="github-detail-edit-button"
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

export default GitHubDetail;
