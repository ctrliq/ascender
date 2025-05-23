import React from 'react';
import { Link, Redirect, Route, Switch, useRouteMatch } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import LDAPDetail from './LDAPDetail';
import LDAPEdit from './LDAPEdit';

function LDAP() {
  const { i18n } = useLingui();
  const baseURL = '/settings/ldap';
  const baseRoute = useRouteMatch({ path: '/settings/ldap', exact: true });
  const categoryRoute = useRouteMatch({
    path: '/settings/ldap/:category',
    exact: true,
  });

  return (
    <PageSection>
      <Card>
        <Switch>
          {baseRoute && <Redirect to={`${baseURL}/default/details`} exact />}
          {categoryRoute && (
            <Redirect
              to={`${baseURL}/${categoryRoute.params.category}/details`}
              exact
            />
          )}
          <Route path={`${baseURL}/:category/details`}>
            <LDAPDetail />
          </Route>
          <Route path={`${baseURL}/:category/edit`}>
            <LDAPEdit />
          </Route>
          <Route key="not-found" path={`${baseURL}/*`}>
            <ContentError isNotFound>
              <Link to={`${baseURL}/default/details`}>
                {i18n._(msg`View LDAP Settings`)}
              </Link>
            </ContentError>
          </Route>
        </Switch>
      </Card>
    </PageSection>
  );
}

export default LDAP;
