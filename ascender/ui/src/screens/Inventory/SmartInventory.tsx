import type {
  DetailedError,
  InstanceGroup,
  Inventory as InventoryModel,
  OptionsResponse,
  SetBreadcrumb,
} from 'types/api';
import React, { useCallback, useEffect } from 'react';
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
import { useLingui } from '@lingui/react/macro';

import useRequest from 'hooks/useRequest';
import { InventoriesAPI } from 'api';

import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import { ResourceAccessList } from 'components/ResourceAccessList';
import RoutedTabs from 'components/RoutedTabs';
import RelatedTemplateList from 'components/RelatedTemplateList';
import SmartInventoryDetail from './SmartInventoryDetail';
import SmartInventoryEdit from './SmartInventoryEdit';
import AdvancedInventoryHosts from './AdvancedInventoryHosts';
import { getInventoryPath } from './shared/utils';
import { inventoryRunsRoutes } from './shared/InventoryRuns';

/** What the edit form draws with, read only on the edit route. */
interface SmartInventoryEditData {
  formOptions: OptionsResponse;
  instanceGroups: InstanceGroup[];
}

export interface SmartInventoryProps {
  setBreadcrumb: SetBreadcrumb;
  [key: string]: unknown;
}

function SmartInventory({ setBreadcrumb }: SmartInventoryProps) {
  const { t } = useLingui();
  const location = useLocation();
  const { id } = useParams() as { id: string };
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
    null as InventoryModel | null
  );

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory, location.pathname]);

  /*
   * What the edit form draws with is read only on the edit route, and read
   * whole before the form draws so it has one loading state rather than a
   * second one inside it. Read with the inventory it was asked for again on
   * every change of tab, and a failure to read it replaced the whole page
   * with an error although only the form needs it. The instance groups are
   * read again each time the form opens, since saving it changes them.
   */
  const isEditRoute = location.pathname.endsWith('/edit');
  const {
    result: editData,
    error: editDataError,
    request: fetchEditData,
    setValue: setEditData,
  } = useRequest<SmartInventoryEditData | null>(
    useCallback(async () => {
      const [{ data: formOptions }, groups] = await Promise.all([
        InventoriesAPI.readOptions(),
        InventoriesAPI.readInstanceGroups(id),
      ]);
      return { formOptions, instanceGroups: groups.data.results };
    }, [id]),
    null
  );

  // Dropped on the way out, so the form never opens on the last visit's groups.
  useEffect(() => {
    if (isEditRoute) {
      fetchEditData();
    } else {
      setEditData(null);
    }
  }, [isEditRoute, fetchEditData, setEditData]);

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
    { name: t`Details`, link: `${smartBaseUrl}/details`, id: 0 },
    { name: t`Access`, link: `${smartBaseUrl}/access`, id: 1 },
    { name: t`Hosts`, link: `${smartBaseUrl}/hosts`, id: 2 },
    // Runs last, after the inventory's own tabs, as on every screen.
    {
      name: t`Job Templates`,
      link: `${smartBaseUrl}/job_templates`,
      id: 3,
    },
    {
      name: t`Runs`,
      link: `${smartBaseUrl}/runs`,
      id: 4,
    },
  ];

  /*
   * One loading animation, until the inventory first arrives. A later read, on
   * a change of tab, keeps the page already drawn rather than swapping it for
   * the animation and back.
   */
  if (hasContentLoading && !inventory) {
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
                {t`Smart Inventory not found.`}{' '}
                <Link to="/inventories">{t`View all Inventories.`}</Link>
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

  // The edit route waits on what the form draws with, and alone reports it.
  let editElement: React.ReactNode = <ContentLoading />;
  if (editDataError) {
    editElement = <ContentError error={editDataError} />;
  } else if (inventory && editData) {
    editElement = (
      <SmartInventoryEdit
        inventory={inventory}
        formOptions={editData.formOptions}
        instanceGroups={editData.instanceGroups}
      />
    );
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
          {inventory && <Route path="edit" element={editElement} />}
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
