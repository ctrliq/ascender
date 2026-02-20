import React from 'react';
import { Link, Redirect, Route, Switch, useRouteMatch } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import AzureADDetail from './AzureADDetail';
import AzureADEdit from './AzureADEdit';
import AzureADTenantEdit from './AzureADTenantEdit';

function AzureAD() {
  const { t } = useLingui();
  const baseURL = '/settings/azure';
  const baseRoute = useRouteMatch({ path: '/settings/azure', exact: true });
  const categoryRoute = useRouteMatch({
    path: '/settings/azure/:category',
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
            <AzureADDetail />
          </Route>
          <Route path={`${baseURL}/default/edit`}>
            <AzureADEdit />
          </Route>
          <Route path={`${baseURL}/tenant/edit`}>
            <AzureADTenantEdit />
          </Route>
          <Route key="not-found" path={`${baseURL}/*`}>
            <ContentError isNotFound>
              <Link to={`${baseURL}/default/details`}>
                {t`View Azure AD settings`}
              </Link>
            </ContentError>
          </Route>
        </Switch>
      </Card>
    </PageSection>
  );
}

export default AzureAD;
