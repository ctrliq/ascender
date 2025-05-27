import React from 'react';
import { Link, Redirect, Route, Switch } from 'react-router-dom';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { PageSection, Card } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import { useConfig } from 'contexts/Config';
import MiscSystemDetail from './MiscSystemDetail';
import MiscSystemEdit from './MiscSystemEdit';

function MiscSystem() {
  const { i18n } = useLingui();
  const baseURL = '/settings/miscellaneous_system';
  const { me } = useConfig();

  return (
    <PageSection>
      <Card>
        <Switch>
          <Redirect from={baseURL} to={`${baseURL}/details`} exact />
          <Route path={`${baseURL}/details`}>
            <MiscSystemDetail />
          </Route>
          <Route path={`${baseURL}/edit`}>
            {me?.is_superuser ? (
              <MiscSystemEdit />
            ) : (
              <Redirect to={`${baseURL}/details`} />
            )}
          </Route>
          <Route key="not-found" path={`${baseURL}/*`}>
            <ContentError isNotFound>
              <Link to={`${baseURL}/details`}>
                {i18n._(msg`View Miscellaneous System settings`)}
              </Link>
            </ContentError>
          </Route>
        </Switch>
      </Card>
    </PageSection>
  );
}

export default MiscSystem;
