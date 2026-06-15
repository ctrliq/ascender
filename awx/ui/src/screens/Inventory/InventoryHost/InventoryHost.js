import React, { useEffect, useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import {
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation,
} from 'react-router-dom-v5-compat';
import { Card } from '@patternfly/react-core';
import { CaretLeftIcon } from '@patternfly/react-icons';
import useRequest from 'hooks/useRequest';

import { InventoriesAPI } from 'api';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import RoutedTabs from 'components/RoutedTabs';
import JobList from 'components/JobList';
import InventoryHostDetail from '../InventoryHostDetail';
import InventoryHostEdit from '../InventoryHostEdit';
import InventoryHostFacts from '../InventoryHostFacts';
import InventoryHostGroups from '../InventoryHostGroups';

function InventoryHost({ setBreadcrumb, inventory }) {
  const { t } = useLingui();
  const location = useLocation();
  const { hostId } = useParams();
  const hostListUrl = `/inventories/inventory/${inventory.id}/hosts`;
  const hostBaseUrl = `${hostListUrl}/${hostId}`;

  const {
    result: { host },
    error: contentError,
    isLoading,
    request: fetchHost,
  } = useRequest(
    useCallback(async () => {
      const response = await InventoriesAPI.readHostDetail(
        inventory.id,
        hostId
      );
      return {
        host: response,
      };
    }, [inventory.id, hostId]),
    {
      host: null,
    }
  );

  useEffect(() => {
    fetchHost();
  }, [fetchHost, location.pathname]);

  useEffect(() => {
    if (inventory && host) {
      setBreadcrumb(inventory, host);
    }
  }, [inventory, host, setBreadcrumb]);

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Hosts`}
        </>
      ),
      link: `${hostListUrl}`,
      id: 0,
    },
    {
      name: t`Details`,
      link: `${hostBaseUrl}/details`,
      id: 1,
    },
    {
      name: t`Facts`,
      link: `${hostBaseUrl}/facts`,
      id: 2,
    },
    {
      name: t`Groups`,
      link: `${hostBaseUrl}/groups`,
      id: 3,
    },
    {
      name: t`Jobs`,
      link: `${hostBaseUrl}/jobs`,
      id: 4,
    },
  ];

  if (contentError) {
    return (
      <Card>
        <ContentError error={contentError}>
          {contentError.response && contentError.response.status === 404 && (
            <span>
              {t`Host not found.`}{' '}
              <Link to={hostListUrl}>
                {t`View all Inventory Hosts.`}
              </Link>
            </span>
          )}
        </ContentError>
      </Card>
    );
  }

  let showCardHeader = true;
  if (['edit'].some((name) => location.pathname.includes(name))) {
    showCardHeader = false;
  }

  return (
    <>
      {showCardHeader && <RoutedTabs tabsArray={tabsArray} />}

      {isLoading && <ContentLoading />}

      {!isLoading && host && (
        <Routes>
          <Route
            index
            element={<Navigate to={`${hostBaseUrl}/details`} replace />}
          />
          <Route
            path="details"
            element={<InventoryHostDetail host={host} />}
          />
          <Route
            path="edit"
            element={<InventoryHostEdit host={host} inventory={inventory} />}
          />
          <Route
            path="facts"
            element={<InventoryHostFacts host={host} />}
          />
          {/* /* so the nested <InventoryHostGroups> route tree can match */}
          <Route
            path="groups/*"
            element={<InventoryHostGroups />}
          />
          <Route
            path="jobs"
            element={<JobList defaultParams={{ job__hosts: host.id }} />}
          />
          <Route
            path="*"
            element={
              <ContentError isNotFound>
                <Link to={`${hostBaseUrl}/details`}>
                  {t`View Inventory Host Details`}
                </Link>
              </ContentError>
            }
          />
        </Routes>
      )}
    </>
  );
}

export default InventoryHost;
