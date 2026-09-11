import type { Host, Inventory, Untyped } from 'types/api';
import React, { useEffect, useCallback } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Link, Routes, Route, Navigate, useParams } from 'react-router';
import { CaretLeftIcon } from '@patternfly/react-icons';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import RoutedTabs from 'components/RoutedTabs';
import useRequest from 'hooks/useRequest';
import { InventoriesAPI } from 'api';
import AdvancedInventoryHostDetail from '../AdvancedInventoryHostDetail';

export interface AdvancedInventoryHostProps {
  inventory: Inventory;
  setBreadcrumb: (resource?: Untyped, nested?: Untyped) => void;
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
          <Route
            path="*"
            element={
              <ContentError isNotFound>
                <Link to={`${hostBaseUrl}/details`}>
                  {inventoryType === 'smart_inventory'
                    ? t`View smart inventory host details`
                    : t`View constructed inventory host details`}
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
