import React from 'react';
import { Link, Redirect, Route, Switch } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { t } from '@lingui/react/macro';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import TroubleshootingDetail from './TroubleshootingDetail';
import TroubleshootingEdit from './TroubleshootingEdit';

function Troubleshooting() {
  const { i18n } = useLingui();
  const baseURL = '/settings/troubleshooting';
  return (
    <PageSection>
      <Card>
        <Switch>
          <Redirect from={baseURL} to={`${baseURL}/details`} exact />
          <Route path={`${baseURL}/details`}>
            <TroubleshootingDetail />
          </Route>
          <Route path={`${baseURL}/edit`}>
            <TroubleshootingEdit />
          </Route>
          <Route key="not-found" path={`${baseURL}/*`}>
            <ContentError isNotFound>
              <Link to={`${baseURL}/details`}>
                {i18n._(t`View Troubleshooting settings`)}
              </Link>
            </ContentError>
          </Route>
        </Switch>
      </Card>
    </PageSection>
  );
}

export default Troubleshooting;
