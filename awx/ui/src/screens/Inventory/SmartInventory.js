import React, { useCallback, useEffect } from 'react';
import { Link,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation } from 'react-router';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';

import useRequest from 'hooks/useRequest';
import { InventoriesAPI } from 'api';

import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import JobList from 'components/JobList';
import { ResourceAccessList } from 'components/ResourceAccessList';
import RoutedTabs from 'components/RoutedTabs';
import RelatedTemplateList from 'components/RelatedTemplateList';
import SmartInventoryDetail from './SmartInventoryDetail';
import SmartInventoryEdit from './SmartInventoryEdit';
import AdvancedInventoryHosts from './AdvancedInventoryHosts';
import { getInventoryPath } from './shared/utils';

function SmartInventory({ setBreadcrumb }) {
  const { t } = useLingui();
  const location = useLocation();
  const { id } = useParams();
  const smartBaseUrl = `/inventories/smart_inventory/${id}`;

  const {
    result: inventory,
    error: contentError,
    isLoading: hasContentLoading,
    request: fetchInventory,
  } = useRequest(
    useCallback(async () => {
      const { data } = await InventoriesAPI.readDetail(id);
      return data;
    }, [id]),

    null
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
    { name: t`Details`, link: `${smartBaseUrl}/details`, id: 0 },
    { name: t`Access`, link: `${smartBaseUrl}/access`, id: 1 },
    { name: t`Hosts`, link: `${smartBaseUrl}/hosts`, id: 2 },
    {
      name: t`Jobs`,
      link: `${smartBaseUrl}/jobs`,
      id: 3,
    },
    {
      name: t`Job Templates`,
      link: `${smartBaseUrl}/job_templates`,
      id: 4,
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
            {contentError?.response?.status === 404 && (
              <span>
                {t`Smart Inventory not found.`}{' '}
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

  if (inventory && inventory?.kind !== 'smart') {
    return <Navigate to={`${getInventoryPath(inventory)}/details`} replace />;
  }

  let showCardHeader = true;

  if (['edit', 'hosts/'].some((name) => location.pathname.includes(name))) {
    showCardHeader = false;
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        {showCardHeader && <RoutedTabs tabsArray={tabsArray} />}
        <Routes>
          <Route
            index
            element={<Navigate to={`${smartBaseUrl}/details`} replace />}
          />
          {inventory && (
            <Route
              path="details"
              element={
                <SmartInventoryDetail
                  isLoading={hasContentLoading}
                  inventory={inventory}
                />
              }
            />
          )}
          {inventory && (
            <Route
              path="edit"
              element={<SmartInventoryEdit inventory={inventory} />}
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
              !hasContentLoading ? (
                <ContentError isNotFound>
                  {id && (
                    <Link to={`${smartBaseUrl}/details`}>
                      {t`View Inventory Details`}
                    </Link>
                  )}
                </ContentError>
              ) : null
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export { SmartInventory as _SmartInventory };
export default SmartInventory;
