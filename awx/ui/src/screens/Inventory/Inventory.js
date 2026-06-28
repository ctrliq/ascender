import React, { useEffect, useState } from 'react';
import { useLingui } from '@lingui/react/macro';

import { Link,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams } from 'react-router';
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
  const { t } = useLingui();
  const [contentError, setContentError] = useState(null);
  const [hasContentLoading, setHasContentLoading] = useState(true);
  const [inventory, setInventory] = useState(null);
  const location = useLocation();
  const { id } = useParams();
  const inventoryBaseUrl = `/inventories/inventory/${id}`;

  useEffect(() => {
    async function fetchData() {
      try {
        const { data } = await InventoriesAPI.readDetail(id);
        setBreadcrumb(data);
        setInventory(data);
      } catch (error) {
        setContentError(error);
      } finally {
        setHasContentLoading(false);
      }
    }

    fetchData();
  }, [id, location.pathname, setBreadcrumb]);

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
      persistentFilterKey: 'inventories',
    },
    { name: t`Details`, link: `${inventoryBaseUrl}/details`, id: 0 },
    { name: t`Access`, link: `${inventoryBaseUrl}/access`, id: 1 },
    { name: t`Groups`, link: `${inventoryBaseUrl}/groups`, id: 2 },
    { name: t`Hosts`, link: `${inventoryBaseUrl}/hosts`, id: 3 },
    { name: t`Sources`, link: `${inventoryBaseUrl}/sources`, id: 4 },
    {
      name: t`Jobs`,
      link: `${inventoryBaseUrl}/jobs`,
      id: 5,
    },
    {
      name: t`Job Templates`,
      link: `${inventoryBaseUrl}/job_templates`,
      id: 6,
    },
  ];

  if (hasContentLoading) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentLoading />
        </Card>
      </PageSection>
    );
  }

  if (contentError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={contentError}>
            {contentError.response?.status === 404 && (
              <span>
                {t`Inventory not found.`}{' '}
                <Link to="/inventories">
                  {t`View all Inventories.`}
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
    return <Navigate to={`${getInventoryPath(inventory)}/details`} replace />;
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        {showCardHeader && <RoutedTabs tabsArray={tabsArray} />}
        <Routes>
          <Route
            index
            element={<Navigate to={`${inventoryBaseUrl}/details`} replace />}
          />
          {inventory && (
            <Route
              path="details"
              element={
                <InventoryDetail
                  inventory={inventory}
                  hasInventoryLoading={hasContentLoading}
                />
              }
            />
          )}
          {inventory && (
            <Route
              path="edit"
              element={<InventoryEdit inventory={inventory} />}
            />
          )}
          {/* /* so the nested <InventoryHosts> route tree can match */}
          {inventory && (
            <Route
              path="hosts/*"
              element={
                <InventoryHosts
                  inventory={inventory}
                  setBreadcrumb={setBreadcrumb}
                />
              }
            />
          )}
          {inventory && (
            <Route
              path="access"
              element={
                <ResourceAccessList
                  resource={inventory}
                  apiModel={InventoriesAPI}
                />
              }
            />
          )}
          {/* /* so the nested <InventoryGroups> route tree can match */}
          {inventory && (
            <Route
              path="groups/*"
              element={
                <InventoryGroups
                  inventory={inventory}
                  setBreadcrumb={setBreadcrumb}
                />
              }
            />
          )}
          {/* /* so the nested <InventorySources> route tree can match */}
          {inventory && (
            <Route
              path="sources/*"
              element={
                <InventorySources
                  inventory={inventory}
                  setBreadcrumb={setBreadcrumb}
                />
              }
            />
          )}
          {inventory && (
            <Route
              path="jobs"
              element={
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
              }
            />
          )}
          {inventory && (
            <Route
              path="job_templates"
              element={
                <RelatedTemplateList
                  searchParams={{ inventory__id: inventory.id }}
                  resourceName={inventory.name}
                />
              }
            />
          )}
          <Route
            path="*"
            element={
              <ContentError isNotFound>
                {id && (
                  <Link to={`${inventoryBaseUrl}/details`}>
                    {t`View Inventory Details`}
                  </Link>
                )}
              </ContentError>
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export { Inventory as _Inventory };
export default Inventory;
