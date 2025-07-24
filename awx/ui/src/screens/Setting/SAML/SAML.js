import React from 'react';
import { Link, Redirect, Route, Switch } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import SAMLDetail from './SAMLDetail';
import SAMLEdit from './SAMLEdit';

function SAML() {
  const { i18n } = useLingui();
  const baseURL = '/settings/saml';
  return (
    <PageSection>
      <Card>
        <Switch>
          <Redirect from={baseURL} to={`${baseURL}/details`} exact />
          <Route path={`${baseURL}/details`}>
            <SAMLDetail />
          </Route>
          <Route path={`${baseURL}/edit`}>
            <SAMLEdit />
          </Route>
          <Route key="not-found" path={`${baseURL}/*`}>
            <ContentError isNotFound>
              <Link to={`${baseURL}/details`}>
                {i18n._(msg`View SAML settings`)}
              </Link>
            </ContentError>
          </Route>
        </Switch>
      </Card>
    </PageSection>
  );
}

export default SAML;
