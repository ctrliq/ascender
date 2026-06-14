import React, { useEffect, useCallback } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import {
  Routes,
  Route,
  Navigate,
  useParams,
} from 'react-router-dom-v5-compat';
import { CaretLeftIcon } from '@patternfly/react-icons';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import RoutedTabs from 'components/RoutedTabs';
import useRequest from 'hooks/useRequest';
import { InventoriesAPI } from 'api';
import AdvancedInventoryHostDetail from '../AdvancedInventoryHostDetail';

function AdvancedInventoryHost({ inventory, setBreadcrumb }) {
  const { t } = useLingui();
  const { inventoryType, hostId } = useParams();
  const hostBaseUrl = `/inventories/${inventoryType}/${inventory.id}/hosts/${hostId}`;

  const {
    result: host,
    error,
    isLoading,
    request: fetchHost,
  } = useRequest(
    useCallback(async () => {
      const response = await InventoriesAPI.readHostDetail(
        inventory.id,
        hostId
      );
      return response;
    }, [inventory.id, hostId]),
    { isLoading: true }
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
            path="/inventories/:inventoryType/:id/hosts/:hostId"
            element={<Navigate to={`${hostBaseUrl}/details`} replace />}
          />
          <Route
            path="/inventories/:inventoryType/:id/hosts/:hostId/details"
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
