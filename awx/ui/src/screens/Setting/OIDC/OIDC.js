import React from 'react';
import { Link, Redirect, Route, Switch } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import OIDCDetail from './OIDCDetail';
import OIDCEdit from './OIDCEdit';

function OIDC() {
  const { i18n } = useLingui();
  const baseURL = '/settings/oidc';
  return (
    <PageSection>
      <Card>
        <Switch>
          <Redirect from={baseURL} to={`${baseURL}/details`} exact />
          <Route path={`${baseURL}/details`}>
            <OIDCDetail />
          </Route>
          <Route path={`${baseURL}/edit`}>
            <OIDCEdit />
          </Route>
          <Route key="not-found" path={`${baseURL}/*`}>
            <ContentError isNotFound>
              <Link to={`${baseURL}/details`}>{i18n._(msg`View OIDC settings`)}</Link>
            </ContentError>
          </Route>
        </Switch>
      </Card>
    </PageSection>
  );
}

export default OIDC;
