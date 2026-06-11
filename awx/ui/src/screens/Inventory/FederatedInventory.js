import React, { useCallback, useEffect } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Link, Switch, Route, Redirect, useRouteMatch, useLocation } from 'react-router-dom';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';

import useRequest from 'hooks/useRequest';
import { FederatedInventoriesAPI, InventoriesAPI } from 'api';

import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import JobList from 'components/JobList';
import RelatedTemplateList from 'components/RelatedTemplateList';
import { ResourceAccessList } from 'components/ResourceAccessList';
import RoutedTabs from 'components/RoutedTabs';
import FederatedInventoryDetail from './FederatedInventoryDetail';
import FederatedInventoryEdit from './FederatedInventoryEdit';
import InventoryGroups from './InventoryGroups';
import AdvancedInventoryHosts from './AdvancedInventoryHosts';
import { getInventoryPath } from './shared/utils';

function FederatedInventory({ setBreadcrumb }) {
  const { t } = useLingui();
  const location = useLocation();
  const match = useRouteMatch('/inventories/federated_inventory/:id');

  const {
    result: inventory,
    error: contentError,
    request: fetchInventory,
    isLoading,
  } = useRequest(
    useCallback(async () => {
      const { data } = await FederatedInventoriesAPI.readDetail(
        match.params.id
      );
      return data;
    }, [match.params.id]),
    { inventory: null, isLoading: true }
  );

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory, location.pathname]);

  useEffect(() => {
    if (inventory) {
      setBreadcrumb(inventory);
    }
  }, [inventory, setBreadcrumb]);

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Inventories`}
        </>
      ),
      link: `/inventories`,
      id: 99,
    },
    { name: t`Details`, link: `${match.url}/details`, id: 0 },
    { name: t`Access`, link: `${match.url}/access`, id: 1 },
    { name: t`Hosts`, link: `${match.url}/hosts`, id: 2 },
    { name: t`Groups`, link: `${match.url}/groups`, id: 3 },
    { name: t`Jobs`, link: `${match.url}/jobs`, id: 4 },
    { name: t`Job Templates`, link: `${match.url}/job_templates`, id: 5 },
  ];

  if (isLoading) {
    return (
      <PageSection>
        <Card>
          <ContentLoading />
        </Card>
      </PageSection>
    );
  }

  if (contentError) {
    return (
      <PageSection>
        <Card>
          <ContentError error={contentError}>
            {contentError?.response?.status === 404 && (
              <span>
                {t`Federated Inventory not found.`}{' '}
                <Link to="/inventories">{t`View all Inventories.`}</Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  if (inventory && inventory?.kind !== 'federated') {
    return <Redirect to={`${getInventoryPath(inventory)}/details`} />;
  }

  let showCardHeader = true;
  if (
    ['edit', 'add', 'groups/', 'hosts/'].some((name) =>
      location.pathname.includes(name)
    )
  ) {
    showCardHeader = false;
  }

  return (
    <PageSection>
      <Card>
        {showCardHeader && <RoutedTabs tabsArray={tabsArray} />}
        <Switch>
          <Redirect
            from="/inventories/federated_inventory/:id"
            to="/inventories/federated_inventory/:id/details"
            exact
          />
          {inventory && [
            <Route
              path="/inventories/federated_inventory/:id/details"
              key="details"
            >
              <FederatedInventoryDetail inventory={inventory} />
            </Route>,
            <Route
              key="edit"
              path="/inventories/federated_inventory/:id/edit"
            >
              <FederatedInventoryEdit inventory={inventory} />
            </Route>,
            <Route
              path="/inventories/federated_inventory/:id/access"
              key="access"
            >
              <ResourceAccessList
                resource={inventory}
                apiModel={InventoriesAPI}
              />
            </Route>,
            <Route
              path="/inventories/federated_inventory/:id/hosts"
              key="hosts"
            >
              <AdvancedInventoryHosts
                inventory={inventory}
                setBreadcrumb={setBreadcrumb}
              />
            </Route>,
            <Route
              path="/inventories/federated_inventory/:id/groups"
              key="federated_inventory_groups"
            >
              <InventoryGroups
                inventory={inventory}
                setBreadcrumb={setBreadcrumb}
              />
            </Route>,
            <Route
              key="jobs"
              path="/inventories/federated_inventory/:id/jobs"
            >
              <JobList
                defaultParams={{
                  or__job__inventory: inventory.id,
                  or__adhoccommand__inventory: inventory.id,
                  or__workflowjob__inventory: inventory.id,
                }}
              />
            </Route>,
            <Route
              key="job_templates"
              path="/inventories/federated_inventory/:id/job_templates"
            >
              <RelatedTemplateList
                searchParams={{ inventory__id: inventory.id }}
              />
            </Route>,
          ]}
          <Route path="*" key="not-found">
            <ContentError isNotFound>
              {match.params.id && (
                <Link
                  to={`/inventories/federated_inventory/${match.params.id}/details`}
                >
                  {t`View Federated Inventory Details`}
                </Link>
              )}
            </ContentError>
          </Route>
        </Switch>
      </Card>
    </PageSection>
  );
}

export { FederatedInventory as _FederatedInventory };
export default FederatedInventory;
