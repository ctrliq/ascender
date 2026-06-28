import React, { useCallback, useEffect } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Link,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation } from 'react-router';
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
  const { id } = useParams();
  const federatedBaseUrl = `/inventories/federated_inventory/${id}`;

  const {
    result: inventory,
    error: contentError,
    request: fetchInventory,
    isLoading,
  } = useRequest(
    useCallback(async () => {
      const { data } = await FederatedInventoriesAPI.readDetail(id);
      return data;
    }, [id]),
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
    { name: t`Details`, link: `${federatedBaseUrl}/details`, id: 0 },
    { name: t`Access`, link: `${federatedBaseUrl}/access`, id: 1 },
    { name: t`Hosts`, link: `${federatedBaseUrl}/hosts`, id: 2 },
    { name: t`Groups`, link: `${federatedBaseUrl}/groups`, id: 3 },
    { name: t`Jobs`, link: `${federatedBaseUrl}/jobs`, id: 4 },
    { name: t`Job Templates`, link: `${federatedBaseUrl}/job_templates`, id: 5 },
  ];

  if (isLoading) {
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
            element={<Navigate to={`${federatedBaseUrl}/details`} replace />}
          />
          {inventory && (
            <Route
              path="details"
              element={<FederatedInventoryDetail inventory={inventory} />}
            />
          )}
          {inventory && (
            <Route
              path="edit"
              element={<FederatedInventoryEdit inventory={inventory} />}
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
          {inventory && (
            <Route
              path="jobs"
              element={
                <JobList
                  defaultParams={{
                    or__job__inventory: inventory.id,
                    or__adhoccommand__inventory: inventory.id,
                    or__workflowjob__inventory: inventory.id,
                  }}
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
                />
              }
            />
          )}
          <Route
            path="*"
            element={
              <ContentError isNotFound>
                {id && (
                  <Link to={`${federatedBaseUrl}/details`}>
                    {t`View Federated Inventory Details`}
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

export { FederatedInventory as _FederatedInventory };
export default FederatedInventory;
