import type { AnyInventory, Host, SetBreadcrumb } from 'types/api';
import React, { useEffect, useCallback } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Link, Routes, Route, Navigate, useParams } from 'react-router';
import { CaretLeftIcon } from '@patternfly/react-icons';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import RoutedTabs from 'components/RoutedTabs';
import JobList from 'components/JobList';
import InventoryRunMenu from 'components/JobList/InventoryRunMenu';
import useRequest from 'hooks/useRequest';
import { InventoriesAPI } from 'api';
import AdvancedInventoryHostDetail from '../AdvancedInventoryHostDetail';
import InventoryHostFacts from '../InventoryHostFacts';

export interface AdvancedInventoryHostProps {
  inventory: AnyInventory;
  setBreadcrumb: SetBreadcrumb;
  [key: string]: unknown;
}

function AdvancedInventoryHost({
  inventory,
  setBreadcrumb,
}: AdvancedInventoryHostProps) {
  const { t } = useLingui();
  const { inventoryType, hostId } = useParams() as {
    inventoryType: string;
    hostId: string;
  };
  const hostBaseUrl = `/inventories/${inventoryType}/${inventory.id}/hosts/${hostId}`;
  /* This screen serves smart, constructed and federated inventories alike,
     so the way back names the kind the host is actually in. */
  const notFoundLink = {
    smart_inventory: t`View Smart Inventory Host Details`,
    constructed_inventory: t`View Constructed Inventory Host Details`,
    federated_inventory: t`View Federated Inventory Host Details`,
  };

  const {
    result: host,
    error,
    isLoading,
    request: fetchHost,
  } = useRequest<Host | null | undefined>(
    useCallback(async () => {
      const response = await InventoriesAPI.readHostDetail(
        inventory.id,
        hostId
      );
      return response;
    }, [inventory.id, hostId]),
    // The tabs render before the host arrives, and the routes below wait for it.
    null
  );

  useEffect(() => {
    fetchHost();
  }, [fetchHost]);

  useEffect(() => {
    if (inventory && host) {
      setBreadcrumb(inventory, host);
    }
  }, [inventory, host, setBreadcrumb]);

  if (error) {
    return <ContentError error={error} />;
  }
  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Hosts`}
        </>
      ),
      link: `/inventories/${inventoryType}/${inventory.id}/hosts`,
      id: 0,
    },
    {
      name: t`Details`,
      link: `${hostBaseUrl}/details`,
      id: 1,
    },
    // The same tabs a regular inventory's host has, bar its groups.
    {
      name: t`Facts`,
      link: `${hostBaseUrl}/facts`,
      id: 2,
    },
    {
      name: t`Runs`,
      link: `${hostBaseUrl}/runs`,
      id: 3,
    },
  ];

  return (
    <>
      <RoutedTabs tabsArray={tabsArray} />

      {isLoading && <ContentLoading />}

      {!isLoading && host && (
        <Routes>
          <Route
            index
            element={<Navigate to={`${hostBaseUrl}/details`} replace />}
          />
          <Route
            path="details"
            element={<AdvancedInventoryHostDetail host={host} />}
          />
          <Route path="facts" element={<InventoryHostFacts host={host} />} />
          {/* The tab's address before the rail called these runs. */}
          <Route path="jobs" element={<Navigate to="../runs" replace />} />
          <Route
            path="runs"
            element={
              <JobList
                defaultParams={{ job__hosts: host.id }}
                /* The hosts list's Run menu, aimed at this one host in the
                   inventory it is listed under. */
                runControl={
                  <InventoryRunMenu
                    inventoryId={inventory.id}
                    items={[{ id: host.id, name: host.name }]}
                    tooltip={t`Run on Host`}
                  />
                }
              />
            }
          />
          <Route
            path="*"
            element={
              <ContentError isNotFound>
                <Link to={`${hostBaseUrl}/details`}>
                  {notFoundLink[inventoryType as keyof typeof notFoundLink] ??
                    t`View Inventory Host Details`}
                </Link>
              </ContentError>
            }
          />
        </Routes>
      )}
    </>
  );
}

export default AdvancedInventoryHost;
