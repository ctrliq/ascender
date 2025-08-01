import React, { useCallback, useEffect } from 'react';
import { Link, Route, Switch, Redirect } from 'react-router-dom';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import ScreenHeader from 'components/ScreenHeader';
import { SettingsProvider } from 'contexts/Settings';
import { useConfig } from 'contexts/Config';
import { SettingsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import AzureAD from './AzureAD';
import GitHub from './GitHub';
import GoogleOAuth2 from './GoogleOAuth2';
import OIDC from './OIDC';
import Jobs from './Jobs';
import LDAP from './LDAP';
import Subscription from './Subscription';
import Logging from './Logging';
import MiscAuthentication from './MiscAuthentication';
import MiscSystem from './MiscSystem';
import RADIUS from './RADIUS';
import SAML from './SAML';
import SettingList from './SettingList';
import TACACS from './TACACS';
import UI from './UI';
import Troubleshooting from './Troubleshooting';

function Settings() {
  const { i18n } = useLingui();
  const { license_info = {}, me } = useConfig();

  const { request, result, isLoading, error } = useRequest(
    useCallback(async () => {
      const response = await SettingsAPI.readAllOptions();
      return response.data.actions;
    }, [])
  );

  useEffect(() => {
    request();
  }, [request]);

  const breadcrumbConfig = {
    '/settings': i18n._(msg`Settings`),
    '/settings/activity_stream': i18n._(msg`Activity Stream`),
    '/settings/activity_stream/details': i18n._(msg`Details`),
    '/settings/activity_stream/edit': i18n._(msg`Edit Details`),
    '/settings/azure': i18n._(msg`Azure AD`),
    '/settings/azure/details': i18n._(msg`Details`),
    '/settings/azure/edit': i18n._(msg`Edit Details`),
    '/settings/github': null,
    '/settings/github/default': i18n._(msg`GitHub Default`),
    '/settings/github/default/details': i18n._(msg`Details`),
    '/settings/github/default/edit': i18n._(msg`Edit Details`),
    '/settings/github/organization': i18n._(msg`GitHub Organization`),
    '/settings/github/organization/details': i18n._(msg`Details`),
    '/settings/github/organization/edit': i18n._(msg`Edit Details`),
    '/settings/github/team': i18n._(msg`GitHub Team`),
    '/settings/github/team/details': i18n._(msg`Details`),
    '/settings/github/team/edit': i18n._(msg`Edit Details`),
    '/settings/github/enterprise': i18n._(msg`GitHub Enterprise`),
    '/settings/github/enterprise/details': i18n._(msg`Details`),
    '/settings/github/enterprise/edit': i18n._(msg`Edit Details`),
    '/settings/github/enterprise_organization': i18n._(
      msg`GitHub Enterprise Organization`
    ),
    '/settings/github/enterprise_organization/details': i18n._(msg`Details`),
    '/settings/github/enterprise_organization/edit': i18n._(msg`Edit Details`),
    '/settings/github/enterprise_team': i18n._(msg`GitHub Enterprise Team`),
    '/settings/github/enterprise_team/details': i18n._(msg`Details`),
    '/settings/github/enterprise_team/edit': i18n._(msg`Edit Details`),
    '/settings/google_oauth2': i18n._(msg`Google OAuth2`),
    '/settings/google_oauth2/details': i18n._(msg`Details`),
    '/settings/google_oauth2/edit': i18n._(msg`Edit Details`),
    '/settings/oidc': i18n._(msg`Generic OIDC`),
    '/settings/oidc/details': i18n._(msg`Details`),
    '/settings/oidc/edit': i18n._(msg`Edit Details`),
    '/settings/jobs': i18n._(msg`Jobs`),
    '/settings/jobs/details': i18n._(msg`Details`),
    '/settings/jobs/edit': i18n._(msg`Edit Details`),
    '/settings/ldap': null,
    '/settings/ldap/default': i18n._(msg`LDAP Default`),
    '/settings/ldap/1': i18n._(msg`LDAP 1`),
    '/settings/ldap/2': i18n._(msg`LDAP 2`),
    '/settings/ldap/3': i18n._(msg`LDAP 3`),
    '/settings/ldap/4': i18n._(msg`LDAP 4`),
    '/settings/ldap/5': i18n._(msg`LDAP 5`),
    '/settings/ldap/default/details': i18n._(msg`Details`),
    '/settings/ldap/1/details': i18n._(msg`Details`),
    '/settings/ldap/2/details': i18n._(msg`Details`),
    '/settings/ldap/3/details': i18n._(msg`Details`),
    '/settings/ldap/4/details': i18n._(msg`Details`),
    '/settings/ldap/5/details': i18n._(msg`Details`),
    '/settings/ldap/default/edit': i18n._(msg`Edit Details`),
    '/settings/ldap/1/edit': i18n._(msg`Edit Details`),
    '/settings/ldap/2/edit': i18n._(msg`Edit Details`),
    '/settings/ldap/3/edit': i18n._(msg`Edit Details`),
    '/settings/ldap/4/edit': i18n._(msg`Edit Details`),
    '/settings/ldap/5/edit': i18n._(msg`Edit Details`),
    '/settings/logging': i18n._(msg`Logging`),
    '/settings/logging/details': i18n._(msg`Details`),
    '/settings/logging/edit': i18n._(msg`Edit Details`),
    '/settings/miscellaneous_authentication': i18n._(
      msg`Miscellaneous Authentication`
    ),
    '/settings/miscellaneous_authentication/details': i18n._(msg`Details`),
    '/settings/miscellaneous_authentication/edit': i18n._(msg`Edit Details`),
    '/settings/miscellaneous_system': i18n._(msg`Miscellaneous System`),
    '/settings/miscellaneous_system/details': i18n._(msg`Details`),
    '/settings/miscellaneous_system/edit': i18n._(msg`Edit Details`),
    '/settings/radius': i18n._(msg`RADIUS`),
    '/settings/radius/details': i18n._(msg`Details`),
    '/settings/radius/edit': i18n._(msg`Edit Details`),
    '/settings/saml': i18n._(msg`SAML`),
    '/settings/saml/details': i18n._(msg`Details`),
    '/settings/saml/edit': i18n._(msg`Edit Details`),
    '/settings/subscription': i18n._(msg`Subscription`),
    '/settings/subscription/details': i18n._(msg`Details`),
    '/settings/subscription/edit': i18n._(msg`Edit Details`),
    '/settings/tacacs': i18n._(msg`TACACS+`),
    '/settings/tacacs/details': i18n._(msg`Details`),
    '/settings/tacacs/edit': i18n._(msg`Edit Details`),
    '/settings/ui': i18n._(msg`User Interface`),
    '/settings/ui/details': i18n._(msg`Details`),
    '/settings/ui/edit': i18n._(msg`Edit Details`),
    '/settings/troubleshooting': i18n._(msg`Troubleshooting`),
    '/settings/troubleshooting/details': i18n._(msg`Details`),
    '/settings/troubleshooting/edit': i18n._(msg`Edit Details`),
  };

  if (error) {
    return (
      <PageSection>
        <Card>
          <ContentError error={error} />
        </Card>
      </PageSection>
    );
  }

  if (isLoading || !result || !me) {
    return (
      <PageSection>
        <Card>
          <ContentLoading />
        </Card>
      </PageSection>
    );
  }

  if (!me?.is_superuser && !me?.is_system_auditor) {
    return <Redirect to="/" />;
  }

  return (
    <SettingsProvider value={result}>
      <ScreenHeader streamType="setting" breadcrumbConfig={breadcrumbConfig} />
      <Switch>
        <Route path="/settings/azure">
          <AzureAD />
        </Route>
        <Route path="/settings/github">
          <GitHub />
        </Route>
        <Route path="/settings/google_oauth2">
          <GoogleOAuth2 />
        </Route>
        <Route path="/settings/oidc">
          <OIDC />
        </Route>
        <Route path="/settings/jobs">
          <Jobs />
        </Route>
        <Route path="/settings/ldap">
          <LDAP />
        </Route>
        <Route path="/settings/subscription">
          {license_info?.license_type === 'open' ? (
            <Redirect to="/settings" />
          ) : (
            <Subscription />
          )}
        </Route>
        <Route path="/settings/logging">
          <Logging />
        </Route>
        <Route path="/settings/miscellaneous_authentication">
          <MiscAuthentication />
        </Route>
        <Route path="/settings/miscellaneous_system">
          <MiscSystem />
        </Route>
        <Route path="/settings/radius">
          <RADIUS />
        </Route>
        <Route path="/settings/saml">
          <SAML />
        </Route>
        <Route path="/settings/tacacs">
          <TACACS />
        </Route>
        <Route path="/settings/troubleshooting">
          <Troubleshooting />
        </Route>
        <Route path="/settings/ui">
          <UI />
        </Route>
        <Route path="/settings" exact>
          <SettingList />
        </Route>
        <Route key="not-found" path="*">
          <PageSection>
            <Card>
              <ContentError isNotFound>
                <Link to="/settings">{i18n._(msg`View all settings`)}</Link>
              </ContentError>
            </Card>
          </PageSection>
        </Route>
      </Switch>
    </SettingsProvider>
  );
}

export default Settings;
