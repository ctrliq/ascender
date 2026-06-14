import React, { useEffect, useCallback } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Link, useParams, useLocation } from 'react-router-dom';
import { Routes, Route, Navigate } from 'react-router-dom-v5-compat';
import { CaretLeftIcon } from '@patternfly/react-icons';
import useRequest from 'hooks/useRequest';

import { InventoriesAPI, InventorySourcesAPI, OrganizationsAPI } from 'api';
import { Schedules } from 'components/Schedule';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import RoutedTabs from 'components/RoutedTabs';
import NotificationList from 'components/NotificationList/NotificationList';
import InventorySourceDetail from '../InventorySourceDetail';
import InventorySourceEdit from '../InventorySourceEdit';

function InventorySource({ inventory, setBreadcrumb, me }) {
  const { t } = useLingui();
  const location = useLocation();
  const { id, sourceId } = useParams();
  const baseUrl = `/inventories/inventory/${id}/sources/${sourceId}`;
  const sourceListUrl = `/inventories/inventory/${inventory.id}/sources`;

  const {
    result: { source, isNotifAdmin },
    error,
    isLoading,
    request: fetchSource,
  } = useRequest(
    useCallback(async () => {
      const [inventorySource, notifAdminRes] = await Promise.all([
        InventoriesAPI.readSourceDetail(inventory.id, sourceId),
        OrganizationsAPI.read({
          page_size: 1,
          role_level: 'notification_admin_role',
        }),
      ]);
      return {
        source: inventorySource,
        isNotifAdmin: notifAdminRes.data.results.length > 0,
      };
    }, [inventory.id, sourceId]),
    { source: null, isNotifAdmin: false }
  );

  useEffect(() => {
    fetchSource();
  }, [fetchSource, location.pathname]);

  useEffect(() => {
    if (inventory && source) {
      setBreadcrumb(inventory, source);
    }
  }, [inventory, source, setBreadcrumb]);

  const loadSchedules = useCallback(
    (params) => InventorySourcesAPI.readSchedules(source?.id, params),
    [source]
  );

  const loadScheduleOptions = useCallback(
    () => InventorySourcesAPI.readScheduleOptions(source?.id),
    [source]
  );

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Sources`}
        </>
      ),
      link: `${sourceListUrl}`,
      id: 0,
    },
    {
      name: t`Details`,
      link: `${baseUrl}/details`,
      id: 1,
    },
    {
      name: t`Schedules`,
      link: `${baseUrl}/schedules`,
      id: 2,
    },
  ];

  const canToggleNotifications = isNotifAdmin;
  const canSeeNotificationsTab = me.is_system_auditor || isNotifAdmin;

  if (canSeeNotificationsTab) {
    tabsArray.push({
      name: t`Notifications`,
      link: `${baseUrl}/notifications`,
      id: 3,
    });
  }

  if (error) {
    return <ContentError error={error} />;
  }

  let showCardHeader = true;

  if (['edit', 'schedules/'].some((name) => location.pathname.includes(name))) {
    showCardHeader = false;
  }

  return (
    <>
      {showCardHeader && <RoutedTabs tabsArray={tabsArray} />}

      {isLoading && <ContentLoading />}

      {!isLoading && source && (
        <Routes>
          <Route
            path={`${baseUrl}/details`}
            element={<InventorySourceDetail inventorySource={source} />}
          />
          <Route
            path={`${baseUrl}/edit`}
            element={
              <InventorySourceEdit source={source} inventory={inventory} />
            }
          />
          <Route
            path={`${baseUrl}/notifications`}
            element={
              <NotificationList
                id={Number(sourceId)}
                canToggleNotifications={canToggleNotifications}
                apiModel={InventorySourcesAPI}
              />
            }
          />
          <Route
            path={`${baseUrl}/schedules/*`}
            element={
              <Schedules
                apiModel={InventorySourcesAPI}
                setBreadcrumb={(schedule) =>
                  setBreadcrumb(inventory, source, schedule)
                }
                resource={source}
                loadSchedules={loadSchedules}
                loadScheduleOptions={loadScheduleOptions}
              />
            }
          />
          <Route
            path={baseUrl}
            element={<Navigate to={`${baseUrl}/details`} replace />}
          />
          <Route
            path="*"
            element={
              <ContentError isNotFound>
                <Link to={`${baseUrl}/details`}>
                  {t`View inventory source details`}
                </Link>
              </ContentError>
            }
          />
        </Routes>
      )}
    </>
  );
}

export default InventorySource;
