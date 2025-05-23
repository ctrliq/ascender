import React from 'react';
import { Link } from 'react-router-dom';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import {
  Card as _Card,
  CardHeader as _CardHeader,
  CardTitle,
  DataList,
  DataListItem,
  DataListCell,
  DataListItemCells,
  DataListItemRow,
  PageSection,
} from '@patternfly/react-core';
import styled from 'styled-components';
import { useConfig } from 'contexts/Config';
import ContentLoading from 'components/ContentLoading/ContentLoading';
import useBrandName from 'hooks/useBrandName';

const SplitLayout = styled(PageSection)`
  column-count: 1;
  column-gap: 24px;
  @media (min-width: 576px) {
    column-count: 2;
  }
`;
const Card = styled(_Card)`
  && {
    display: inline-block;
    margin-bottom: 24px;
    width: 100%;
  }
`;
const CardHeader = styled(_CardHeader)`
  && {
    align-items: flex-start;
    display: flex;
    flex-flow: column nowrap;
  }
`;
const CardDescription = styled.div`
  color: var(--pf-global--palette--black-600);
  font-size: var(--pf-global--FontSize--xs);
`;

function SettingList() {
  const config = useConfig();
  const brandName = useBrandName();
  const { i18n } = useLingui();

  const settingRoutes = [
    {
      header: i18n._(msg`Authentication`),
      description: i18n._(msg`Enable simplified login for your ${brandName} applications`),
      id: 'authentication',
      routes: [
        {
          title: i18n._(msg`Azure AD settings`),
          path: '/settings/azure',
        },
        {
          title: i18n._(msg`GitHub settings`),
          path: '/settings/github',
        },
        {
          title: i18n._(msg`Google OAuth 2 settings`),
          path: '/settings/google_oauth2',
        },
        {
          title: i18n._(msg`LDAP settings`),
          path: '/settings/ldap',
        },
        {
          title: i18n._(msg`RADIUS settings`),
          path: '/settings/radius',
        },
        {
          title: i18n._(msg`SAML settings`),
          path: '/settings/saml',
        },
        {
          title: i18n._(msg`TACACS+ settings`),
          path: '/settings/tacacs',
        },
        {
          title: i18n._(msg`Generic OIDC settings`),
          path: '/settings/oidc',
        },
      ],
    },
    {
      header: i18n._(msg`Jobs`),
      description: i18n._(msg`Update settings pertaining to Jobs within ${brandName}`),
      id: 'jobs',
      routes: [
        {
          title: i18n._(msg`Jobs settings`),
          path: '/settings/jobs',
        },
      ],
    },
    {
      header: i18n._(msg`System`),
      description: i18n._(msg`Define system-level features and functions`),
      id: 'system',
      routes: [
        {
          title: i18n._(msg`Miscellaneous System settings`),
          path: '/settings/miscellaneous_system',
        },
        {
          title: i18n._(msg`Miscellaneous Authentication settings`),
          path: '/settings/miscellaneous_authentication',
        },
        {
          title: i18n._(msg`Logging settings`),
          path: '/settings/logging',
        },
      ],
    },
    {
      header: i18n._(msg`User Interface`),
      description: i18n._(msg`Set preferences for data collection, logos, and logins`),
      id: 'ui',
      routes: [
        {
          title: i18n._(msg`User Interface settings`),
          path: '/settings/ui',
        },
      ],
    },
    {
      header: i18n._(msg`Subscription`),
      description: i18n._(msg`View and edit your subscription information`),
      id: 'subscription',
      routes: [
        {
          title: i18n._(msg`Subscription settings`),
          path: '/settings/subscription',
        },
      ],
    },
    {
      header: i18n._(msg`Troubleshooting`),
      description: i18n._(msg`View and edit debug options`),
      id: 'troubleshooting',
      routes: [
        {
          title: i18n._(msg`Troubleshooting settings`),
          path: '/settings/troubleshooting',
        },
      ],
    },
  ];

  if (Object.keys(config).length === 0) {
    return (
      <PageSection>
        <Card>
          <ContentLoading />
        </Card>
      </PageSection>
    );
  }

  return (
    <SplitLayout>
      {settingRoutes.map(({ description, header, id, routes }) => {
        if (
          id === 'subscription' &&
          config?.license_info?.license_type === 'open'
        ) {
          return null;
        }
        return (
          <Card isCompact key={header}>
            <CardHeader>
              <CardTitle>{header}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <DataList aria-label={`${id}-settings`} isCompact>
              {routes.map(({ title, path }) => (
                <DataListItem key={title}>
                  <DataListItemRow>
                    <DataListItemCells
                      dataListCells={[
                        <DataListCell key={title}>
                          <Link to={path}>{title}</Link>
                        </DataListCell>,
                      ]}
                    />
                  </DataListItemRow>
                </DataListItem>
              ))}
            </DataList>
          </Card>
        );
      })}
    </SplitLayout>
  );
}

export default SettingList;
