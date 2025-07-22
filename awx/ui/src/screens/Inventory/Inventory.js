import React, { useEffect, useState } from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';

import {
  Switch,
  Route,
  Redirect,
  Link,
  useLocation,
  useRouteMatch,
} from 'react-router-dom';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import JobList from 'components/JobList';
import RoutedTabs from 'components/RoutedTabs';
import { ResourceAccessList } from 'components/ResourceAccessList';
import RelatedTemplateList from 'components/RelatedTemplateList';
import { InventoriesAPI } from 'api';
import InventoryDetail from './InventoryDetail';
import InventoryEdit from './InventoryEdit';
import InventoryGroups from './InventoryGroups';
import InventoryHosts from './InventoryHosts/InventoryHosts';
import InventorySources from './InventorySources';
import { getInventoryPath } from './shared/utils';

function Inventory({ setBreadcrumb }) {
  const { i18n } = useLingui();
  const [contentError, setContentError] = useState(null);
  const [hasContentLoading, setHasContentLoading] = useState(true);
  const [inventory, setInventory] = useState(null);
  const location = useLocation();
  const match = useRouteMatch({
    path: '/inventories/inventory/:id',
  });

  useEffect(() => {
    async function fetchData() {
      try {
        const { data } = await InventoriesAPI.readDetail(match.params.id);
        setBreadcrumb(data);
        setInventory(data);
      } catch (error) {
        setContentError(error);
      } finally {
        setHasContentLoading(false);
      }
    }

    fetchData();
  }, [match.params.id, location.pathname, setBreadcrumb]);

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {i18n._(msg`Back to Inventories`)}
        </>
      ),
      link: `/inventories`,
      id: 99,
      persistentFilterKey: 'inventories',
    },
    { name: i18n._(msg`Details`), link: `${match.url}/details`, id: 0 },
    { name: i18n._(msg`Access`), link: `${match.url}/access`, id: 1 },
    { name: i18n._(msg`Groups`), link: `${match.url}/groups`, id: 2 },
    { name: i18n._(msg`Hosts`), link: `${match.url}/hosts`, id: 3 },
    { name: i18n._(msg`Sources`), link: `${match.url}/sources`, id: 4 },
    {
      name: i18n._(msg`Jobs`),
      link: `${match.url}/jobs`,
      id: 5,
    },
    {
      name: i18n._(msg`Job Templates`),
      link: `${match.url}/job_templates`,
      id: 6,
    },
  ];

  if (hasContentLoading) {
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
            {contentError.response?.status === 404 && (
              <span>
                {i18n._(msg`Inventory not found.`)}{' '}
                <Link to="/inventories">
                  {i18n._(msg`View all Inventories.`)}
                </Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  let showCardHeader = true;

  if (
    ['edit', 'add', 'groups/', 'hosts/', 'sources/'].some((name) =>
      location.pathname.includes(name)
    )
  ) {
    showCardHeader = false;
  }

  if (inventory && inventory?.kind !== '') {
    return <Redirect to={`${getInventoryPath(inventory)}/details`} />;
  }

  return (
    <PageSection>
      <Card>
        {showCardHeader && <RoutedTabs tabsArray={tabsArray} />}
        <Switch>
          <Redirect
            from="/inventories/inventory/:id"
            to="/inventories/inventory/:id/details"
            exact
          />
          {inventory && [
            <Route path="/inventories/inventory/:id/details" key="details">
              <InventoryDetail
                inventory={inventory}
                hasInventoryLoading={hasContentLoading}
              />
            </Route>,
            <Route path="/inventories/inventory/:id/edit" key="edit">
              <InventoryEdit inventory={inventory} />
            </Route>,
            <Route path="/inventories/inventory/:id/hosts" key="hosts">
              <InventoryHosts
                inventory={inventory}
                setBreadcrumb={setBreadcrumb}
              />
            </Route>,
            <Route path="/inventories/inventory/:id/access" key="access">
              <ResourceAccessList
                resource={inventory}
                apiModel={InventoriesAPI}
              />
            </Route>,
            <Route path="/inventories/inventory/:id/groups" key="groups">
              <InventoryGroups
                inventory={inventory}
                setBreadcrumb={setBreadcrumb}
              />
            </Route>,
            <Route path="/inventories/inventory/:id/sources" key="sources">
              <InventorySources
                inventory={inventory}
                setBreadcrumb={setBreadcrumb}
              />
            </Route>,
            <Route path="/inventories/inventory/:id/jobs" key="jobs">
              <JobList
                defaultParams={{
                  or__job__inventory: inventory.id,
                  or__adhoccommand__inventory: inventory.id,
                  or__inventoryupdate__inventory_source__inventory:
                    inventory.id,
                  or__workflowjob__inventory: inventory.id,
                }}
                additionalRelatedSearchableKeys={[
                  'inventoryupdate__inventory_source__inventory',
                ]}
              />
            </Route>,
            <Route
              path="/inventories/inventory/:id/job_templates"
              key="job_templates"
            >
              <RelatedTemplateList
                searchParams={{ inventory__id: inventory.id }}
                resourceName={inventory.name}
              />
            </Route>,
            <Route path="*" key="not-found">
              <ContentError isNotFound>
                {match.params.id && (
                  <Link
                    to={`/inventories/inventory/${match.params.id}/details`}
                  >
                    {i18n._(msg`View Inventory Details`)}
                  </Link>
                )}
              </ContentError>
            </Route>,
          ]}
        </Switch>
      </Card>
    </PageSection>
  );
}

export { Inventory as _Inventory };
export default Inventory;
