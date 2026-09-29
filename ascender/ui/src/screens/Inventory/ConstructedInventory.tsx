import type { DetailedError, SetBreadcrumb } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useLingui } from '@lingui/react/macro';
import {
  Link,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation,
} from 'react-router';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';

import useRequest from 'hooks/useRequest';
import { ConstructedInventoriesAPI, InventoriesAPI } from 'api';

import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import RelatedTemplateList from 'components/RelatedTemplateList';
import { ResourceAccessList } from 'components/ResourceAccessList';
import RoutedTabs from 'components/RoutedTabs';
import ConstructedInventoryDetail from './ConstructedInventoryDetail';
import ConstructedInventoryEdit from './ConstructedInventoryEdit';
import InventoryGroups from './InventoryGroups';
import AdvancedInventoryHosts from './AdvancedInventoryHosts';
import { getInventoryPath } from './shared/utils';
import { inventoryRunsRoutes } from './shared/InventoryRuns';

export interface ConstructedInventoryProps {
  setBreadcrumb: SetBreadcrumb;
  [key: string]: unknown;
}

function ConstructedInventory({ setBreadcrumb }: ConstructedInventoryProps) {
  const { t } = useLingui();
  const location = useLocation();
  const { id } = useParams() as { id: string };
  const constructedBaseUrl = `/inventories/constructed_inventory/${id}`;

  const {
    result: inventory,
    error: contentError,
    request: fetchInventory,
    isLoading,
  } = useRequest(
    useCallback(async () => {
      const { data } = await ConstructedInventoriesAPI.readDetail(id);
      return data;
    }, [id]),
    { isLoading: true }
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
      persistentFilterKey: 'inventories',
    },
    { name: t`Details`, link: `${constructedBaseUrl}/details`, id: 0 },
    { name: t`Access`, link: `${constructedBaseUrl}/access`, id: 1 },
    { name: t`Groups`, link: `${constructedBaseUrl}/groups`, id: 2 },
    { name: t`Hosts`, link: `${constructedBaseUrl}/hosts`, id: 3 },
    // Runs last, after the inventory's own tabs, as on every screen.
    {
      name: t`Job Templates`,
      link: `${constructedBaseUrl}/job_templates`,
      id: 4,
    },
    {
      name: t`Runs`,
      link: `${constructedBaseUrl}/runs`,
      id: 5,
    },
  ];

  if (isLoading) {
    return (
      <PageSection hasBodyWrapper={false}>
        <ContentLoading />
      </PageSection>
    );
  }

  if (contentError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={contentError}>
            {(contentError as DetailedError)?.response?.status === 404 && (
              <span>
                {t`Constructed Inventory not found.`}{' '}
                <Link to="/inventories">{t`View all Inventories.`}</Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  if (inventory && inventory?.kind !== 'constructed') {
    return <Navigate to={`${getInventoryPath(inventory)}/details`} replace />;
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
    <PageSection hasBodyWrapper={false}>
      <Card>
        {showCardHeader && <RoutedTabs tabsArray={tabsArray} />}
        <Routes>
          <Route
            index
            element={<Navigate to={`${constructedBaseUrl}/details`} replace />}
          />
          {inventory && (
            <Route
              path="details"
              element={<ConstructedInventoryDetail inventory={inventory} />}
            />
          )}
          {inventory && (
            <Route
              path="edit"
              element={<ConstructedInventoryEdit inventory={inventory} />}
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
          {/* /* so the nested <AdvancedInventoryHosts> route tree can match */}
          {inventory && (
            <Route
              path="hosts/*"
              element={
                <AdvancedInventoryHosts
                  inventory={inventory}
                  setBreadcrumb={setBreadcrumb}
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
          {inventoryRunsRoutes(inventory)}
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
                  <Link to={`${constructedBaseUrl}/details`}>
                    {t`View Constructed Inventory Details`}
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

export { ConstructedInventory as _ConstructedInventory };
export default ConstructedInventory;
