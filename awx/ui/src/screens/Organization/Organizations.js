import React, { useCallback, useState } from 'react';
import { Route, withRouter, Switch, useRouteMatch } from 'react-router-dom';

import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';

import { Config } from 'contexts/Config';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import OrganizationsList from './OrganizationList/OrganizationList';
import OrganizationAdd from './OrganizationAdd/OrganizationAdd';
import Organization from './Organization';

function Organizations() {
  const { i18n } = useLingui();
  const match = useRouteMatch();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/organizations': i18n._(msg`Organizations`),
    '/organizations/add': i18n._(msg`Create New Organization`),
  });

  const setBreadcrumb = useCallback(
    (organization) => {
      if (!organization) {
        return;
      }

      const breadcrumb = {
        '/organizations': i18n._(msg`Organizations`),
        '/organizations/add': i18n._(msg`Create New Organization`),
        [`/organizations/${organization.id}`]: `${organization.name}`,
        [`/organizations/${organization.id}/edit`]: i18n._(msg`Edit Details`),
        [`/organizations/${organization.id}/details`]: i18n._(msg`Details`),
        [`/organizations/${organization.id}/access`]: i18n._(msg`Access`),
        [`/organizations/${organization.id}/teams`]: i18n._(msg`Teams`),
        [`/organizations/${organization.id}/notifications`]: i18n._(
          msg`Notifications`
        ),
        [`/organizations/${organization.id}/execution_environments`]: i18n._(
          msg`Execution Environments`
        ),
      };
      setBreadcrumbConfig(breadcrumb);
    },
    [i18n]
  );

  return (
    <>
      <ScreenHeader
        streamType="organization"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Switch>
        <Route path={`${match.path}/add`}>
          <OrganizationAdd />
        </Route>
        <Route path={`${match.path}/:id`}>
          <Config>
            {({ me }) => (
              <Organization setBreadcrumb={setBreadcrumb} me={me || {}} />
            )}
          </Config>
        </Route>
        <Route path={`${match.path}`}>
          <PersistentFilters pageKey="organizations">
            <OrganizationsList />
          </PersistentFilters>
        </Route>
      </Switch>
    </>
  );
}

export { Organizations as _Organizations };
export default withRouter(Organizations);
