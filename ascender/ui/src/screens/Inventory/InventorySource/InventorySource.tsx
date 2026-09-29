import type {
  AnyInventory,
  BreadcrumbResource,
  InventorySource as InventorySourceModel,
  SetBreadcrumb,
} from 'types/api';
import type { CurrentUser } from 'contexts/Config';
import React, { useEffect, useCallback } from 'react';

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
import useRequest from 'hooks/useRequest';

import { InventoriesAPI, InventorySourcesAPI, OrganizationsAPI } from 'api';
import { Schedules } from 'components/Schedule';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import RoutedTabs from 'components/RoutedTabs';
import JobList from 'components/JobList';
import NotificationList from 'components/NotificationList/NotificationList';
import type { QSParams } from 'util/qs';
import InventorySourceSyncButton from '../shared/InventorySourceSyncButton';
import InventorySourceDetail from '../InventorySourceDetail';
import InventorySourceEdit from '../InventorySourceEdit';

export interface InventorySourceProps {
  inventory: AnyInventory;
  setBreadcrumb: SetBreadcrumb;
  me: CurrentUser;
  [key: string]: unknown;
}

function InventorySource({
  inventory,
  setBreadcrumb,
  me,
}: InventorySourceProps) {
  const { t } = useLingui();
  const location = useLocation();
  const { sourceId } = useParams() as { sourceId: string };
  const sourceListUrl = `/inventories/inventory/${inventory.id}/sources`;
  const detailsBaseUrl = `${sourceListUrl}/${sourceId}`;

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
    { source: null as InventorySourceModel | null, isNotifAdmin: false }
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
    (params: QSParams) =>
      InventorySourcesAPI.readSchedules(source?.id as number, params),
    [source]
  );

  const loadScheduleOptions = useCallback(
    () => InventorySourcesAPI.readScheduleOptions(source?.id as number),
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
      link: `${detailsBaseUrl}/details`,
      id: 1,
    },
  ];

  const canToggleNotifications = isNotifAdmin;
  const canSeeNotificationsTab = me.is_system_auditor || isNotifAdmin;

  // The same order as a template's or a project's tabs.
  if (canSeeNotificationsTab) {
    tabsArray.push({
      name: t`Notifications`,
      link: `${detailsBaseUrl}/notifications`,
      id: 2,
    });
  }

  tabsArray.push(
    {
      name: t`Schedules`,
      link: `${detailsBaseUrl}/schedules`,
      id: 3,
    },
    {
      name: t`Runs`,
      link: `${detailsBaseUrl}/runs`,
      id: 4,
    }
  );

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
          <Route index element={<Navigate to="details" replace />} />
          <Route
            path="details"
            element={<InventorySourceDetail inventorySource={source} />}
          />
          <Route
            path="edit"
            element={
              <InventorySourceEdit source={source} inventory={inventory} />
            }
          />
          <Route
            path="notifications"
            element={
              <NotificationList
                id={Number(sourceId)}
                canToggleNotifications={canToggleNotifications}
                apiModel={InventorySourcesAPI}
              />
            }
          />
          {/* /* so the nested <Schedules> route tree can match */}
          <Route
            path="schedules/*"
            element={
              <Schedules
                apiModel={InventorySourcesAPI}
                setBreadcrumb={(schedule?: BreadcrumbResource) =>
                  setBreadcrumb(inventory, source, schedule)
                }
                resource={source}
                loadSchedules={loadSchedules}
                loadScheduleOptions={loadScheduleOptions}
              />
            }
          />
          <Route
            path="runs"
            element={
              /*
               * Every sync, including the ones a job launch started for
               * itself, which are as much the source's history as the rest.
               */
              <JobList
                defaultParams={{ unified_job_template: source.id }}
                includeDependencySyncs
                // Sync, as on the source's details, for whoever may.
                runControl={
                  source.summary_fields?.user_capabilities?.start ? (
                    <InventorySourceSyncButton
                      source={source}
                      icon={false}
                      label={t`Run`}
                      tooltip={t`Sync Source`}
                    />
                  ) : (
                    // false, not null: null would bring back the general Run menu.
                    false
                  )
                }
              />
            }
          />
          <Route
            path="*"
            element={
              <ContentError isNotFound>
                <Link to={`${detailsBaseUrl}/details`}>
                  {t`View Inventory Source Details`}
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
