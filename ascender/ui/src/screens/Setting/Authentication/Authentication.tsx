import React from 'react';
import { Link } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { Card, CardBody, PageSection } from '@patternfly/react-core';
import ResourceTabs from 'components/ResourceTabs';
import './Authentication.css';
import { SettingsPage } from '../shared';
import { AUTHENTICATION_TABS } from './tabs';

/**
 * The ways somebody may sign in.
 *
 * The rail names Authentication once, where it used to name the eight provider
 * pages under one heading and leave the session and token expiry under System,
 * two headings away from the thing it governs. Session is the other tab of this
 * page; this one is the list of methods, each its own page as before.
 */
function Authentication() {
  const { t, i18n } = useLingui();

  const providers = [
    {
      title: t`Azure AD`,
      path: '/authentication/azure',
      description: t`Microsoft Entra ID, for one tenant or for any`,
    },
    {
      title: t`GitHub`,
      path: '/authentication/github',
      description: t`A GitHub account, organization, team or enterprise`,
    },
    {
      title: t`Google OAuth 2.0`,
      path: '/authentication/google_oauth2',
      description: t`A Google account, optionally limited to one domain`,
    },
    {
      title: t`Generic OIDC`,
      path: '/authentication/oidc',
      description: t`Any provider that speaks OpenID Connect`,
    },
    {
      title: t`LDAP`,
      path: '/authentication/ldap',
      description: t`A directory, across as many as six servers`,
    },
    {
      title: t`SAML`,
      path: '/authentication/saml',
      description: t`A SAML identity provider, with this install as the service provider`,
    },
  ];

  const breadcrumbConfig = {
    '/authentication': t`Authentication`,
  };

  return (
    <SettingsPage breadcrumbConfig={breadcrumbConfig}>
      <PageSection hasBodyWrapper={false}>
        <Card>
          {/* The bar sits where every other screen's does, at the top of the
            card: the session settings and the sign in methods are the two
            halves of authentication, which the rail names once. */}
          <ResourceTabs
            aria-label={t`Authentication tabs`}
            ouiaId="authentication-tabs"
            tabs={AUTHENTICATION_TABS.map(({ label, path }) => ({
              label: i18n._(label),
              path,
            }))}
          />
          <CardBody className="ascender-authentication__body">
            {/* The grid every settings page lays its own entries out on: three
              to a row, the same gutters, no dividers. A list of eight names
              down the left of an empty card read as a menu of a menu. */}
            <div
              className="ascender-detail-list"
              data-cy="authentication-providers"
            >
              {providers.map(({ title, path, description }) => (
                <div key={title}>
                  <Link
                    className="ascender-authentication__provider-name"
                    to={path}
                  >
                    {title}
                  </Link>
                  <div className="ascender-authentication__provider-description">
                    {description}
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </PageSection>
    </SettingsPage>
  );
}

export default Authentication;
