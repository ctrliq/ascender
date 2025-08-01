import React from 'react';
import { Link, Redirect, Route, Switch } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import RADIUSDetail from './RADIUSDetail';
import RADIUSEdit from './RADIUSEdit';

function RADIUS() {
  const { i18n } = useLingui();
  const baseURL = '/settings/radius';
  return (
    <PageSection>
      <Card>
        <Switch>
          <Redirect from={baseURL} to={`${baseURL}/details`} exact />
          <Route path={`${baseURL}/details`}>
            <RADIUSDetail />
          </Route>
          <Route path={`${baseURL}/edit`}>
            <RADIUSEdit />
          </Route>
          <Route key="not-found" path={`${baseURL}/*`}>
            <ContentError isNotFound>
              <Link to={`${baseURL}/details`}>
                {i18n._(msg`View RADIUS settings`)}
              </Link>
            </ContentError>
          </Route>
        </Switch>
      </Card>
    </PageSection>
  );
}

export default RADIUS;
