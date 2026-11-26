import type { SearchableKey } from 'components/PaginatedTable';
import type {
  NotificationTemplate,
  NotificationsApiModel,
  SummaryFieldRef,
} from 'types/api';
import type { QSParams } from 'util/qs';
import React, { useEffect, useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useLingui } from '@lingui/react/macro';
import { getQSConfig, parseQueryString } from 'util/qs';
import useRequest, { useDeleteItems } from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import { NotificationTemplatesAPI } from 'api';
import { getNotificationTypeOptions } from 'util/notificationTypes';
import AlertModal from '../AlertModal';
import ErrorDetail from '../ErrorDetail';
import NotificationListItem from './NotificationListItem';
import DataListToolbar from '../DataListToolbar';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  ToolbarDeleteButton,
  getSearchableKeys,
} from '../PaginatedTable';

const QS_CONFIG = getQSConfig('notification', {
  page: 1,
  page_size: 5,
  order_by: 'name',
});

export interface NotificationListProps {
  apiModel: NotificationsApiModel;
  /**
   * The organization a template added from here belongs to, on an
   * organization's own tab: the form opens with it filled in, and Cancel comes
   * back to the tab. Other resources' tabs have no organization of their own
   * to give a template, so the form opens empty from them.
   */
  addOrganization?: SummaryFieldRef | null;
  canToggleNotifications: boolean;
  id: number | string;
  showApprovalsToggle?: boolean;
  showChangedToggle?: boolean;
  [key: string]: unknown;
}

function NotificationList({
  apiModel,
  canToggleNotifications,
  id,
  addOrganization = null,

  showApprovalsToggle = false,
  showChangedToggle = false,
}: NotificationListProps) {
  const { t, i18n } = useLingui();
  const location = useLocation();
  const navigate = useNavigate();
  const [loadingToggleIds, setLoadingToggleIds] = useState<number[]>([]);
  const [toggleError, setToggleError] = useState<unknown>(null);

  const {
    result: fetchNotificationsResults,
    result: {
      notifications,
      itemCount,
      approvalsTemplateIds,
      changedTemplateIds,
      startedTemplateIds,
      successTemplateIds,
      errorTemplateIds,
      relatedSearchableKeys,
      searchableKeys,
      canCreateTemplates,
    },
    error: contentError,
    isLoading,
    request: fetchNotifications,
    setValue,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [
        {
          data: { results: notificationsResults, count: notificationsCount },
        },
        actionsResponse,
      ] = await Promise.all([
        NotificationTemplatesAPI.read(params),
        NotificationTemplatesAPI.readOptions(),
      ]);

      const idMatchParams: QSParams =
        notificationsResults.length > 0
          ? { id__in: notificationsResults.map((n) => n.id).join(',') }
          : {};

      const [
        { data: startedTemplates },
        { data: successTemplates },
        { data: errorTemplates },
      ] = await Promise.all([
        apiModel.readNotificationTemplatesStarted(id, idMatchParams),
        apiModel.readNotificationTemplatesSuccess(id, idMatchParams),
        apiModel.readNotificationTemplatesError(id, idMatchParams),
      ]);

      // Both of the approvals/changed keys are filled in below, whichever
      // branch runs, so they are declared here rather than added later.
      const rtnObj: {
        notifications: NotificationTemplate[];
        itemCount: number;
        startedTemplateIds: number[];
        successTemplateIds: number[];
        errorTemplateIds: number[];
        approvalsTemplateIds: number[];
        changedTemplateIds: number[];
        relatedSearchableKeys: string[];
        searchableKeys: SearchableKey[];
        canCreateTemplates: boolean;
      } = {
        notifications: notificationsResults,
        approvalsTemplateIds: [],
        changedTemplateIds: [],
        itemCount: notificationsCount,
        startedTemplateIds: startedTemplates.results.map((st) => st.id),
        successTemplateIds: successTemplates.results.map((su) => su.id),
        errorTemplateIds: errorTemplates.results.map((e) => e.id),
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
        // The api offers POST to whoever may make a notification template,
        // which is who the empty tab's way to one is for.
        canCreateTemplates: Boolean(actionsResponse.data.actions?.POST),
      };

      if (showApprovalsToggle && apiModel.readNotificationTemplatesApprovals) {
        const { data: approvalsTemplates } =
          await apiModel.readNotificationTemplatesApprovals(id, idMatchParams);
        rtnObj.approvalsTemplateIds = approvalsTemplates.results.map(
          (st) => st.id
        );
      } else {
        rtnObj.approvalsTemplateIds = [];
      }

      if (showChangedToggle && apiModel.readNotificationTemplatesChanged) {
        const { data: changedTemplates } =
          await apiModel.readNotificationTemplatesChanged(id, idMatchParams);
        rtnObj.changedTemplateIds = changedTemplates.results.map((ch) => ch.id);
      } else {
        rtnObj.changedTemplateIds = [];
      }

      return rtnObj;
    }, [apiModel, id, location, showApprovalsToggle, showChangedToggle]),
    {
      notifications: [],
      itemCount: 0,
      approvalsTemplateIds: [],
      changedTemplateIds: [],
      startedTemplateIds: [],
      successTemplateIds: [],
      errorTemplateIds: [],
      relatedSearchableKeys: [],
      searchableKeys: [],
      canCreateTemplates: false,
    }
  );

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleNotificationToggle = async (
    notificationId: number,
    isCurrentlyOn: boolean,
    // One of the five notification kinds; the key it toggles is
    // `<status>TemplateIds` in the result above.
    status: 'started' | 'success' | 'error' | 'approvals' | 'changed'
  ) => {
    setLoadingToggleIds(loadingToggleIds.concat([notificationId]));
    try {
      if (isCurrentlyOn) {
        await apiModel.disassociateNotificationTemplate(
          id,
          notificationId,
          status
        );
        setValue({
          ...fetchNotificationsResults,
          [`${status}TemplateIds`]: fetchNotificationsResults[
            `${status}TemplateIds` as const
          ].filter((i: number) => i !== notificationId),
        });
      } else {
        await apiModel.associateNotificationTemplate(
          id,
          notificationId,
          status
        );
        setValue({
          ...fetchNotificationsResults,
          [`${status}TemplateIds`]:
            fetchNotificationsResults[`${status}TemplateIds` as const].concat(
              notificationId
            ),
        });
      }
    } catch (err) {
      setToggleError(err);
    } finally {
      setLoadingToggleIds(
        loadingToggleIds.filter((item) => item !== notificationId)
      );
    }
  };

  const { selected, isAllSelected, handleSelect, selectAll, clearSelected } =
    useSelected(notifications);

  /*
   * This tab lists every notification template the viewer can see, not only
   * the ones switched on for this resource, so Delete here destroys the
   * template itself, as the Notification Templates list does. The switches
   * are what take one off this resource alone, and the dialog says so.
   */
  const {
    isLoading: isDeleteLoading,
    deleteItems: deleteTemplates,
    deletionError,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(
      () =>
        Promise.all(
          selected.map((template) =>
            NotificationTemplatesAPI.destroy(template.id)
          )
        ),
      [selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchNotifications,
    }
  );

  const handleDelete = async () => {
    await deleteTemplates();
    clearSelected();
  };

  /*
   * A notification template is made on its own screen and then switched on
   * here, so Add goes to that screen, for whoever the api would let make one.
   */
  let addButton: React.ReactNode = null;
  if (canCreateTemplates) {
    addButton = addOrganization ? (
      <ToolbarAddButton
        key="add"
        tooltip={t`Add Notification Template`}
        onClick={() =>
          navigate('/notifications/add', {
            state: { organization: addOrganization },
          })
        }
      />
    ) : (
      <ToolbarAddButton
        key="add"
        tooltip={t`Add Notification Template`}
        linkTo="/notifications/add"
      />
    );
  }

  return (
    <>
      <PaginatedTable
        contentError={contentError}
        hasContentLoading={isLoading || isDeleteLoading}
        items={notifications}
        itemCount={itemCount}
        pluralizedItemName={t`Notification Templates`}
        emptyContentMessage={
          // The way to one is on this tab now, for whoever may make one; to
          // anybody else the tab can only say what would appear on it.
          canCreateTemplates
            ? t`Add a notification template to enable it here`
            : t`Notification templates you can use appear here`
        }
        qsConfig={QS_CONFIG}
        clearSelected={clearSelected}
        renderToolbar={(props) => (
          <DataListToolbar
            {...props}
            isAllSelected={isAllSelected}
            onSelectAll={selectAll}
            qsConfig={QS_CONFIG}
            additionalControls={[
              ...(addButton ? [addButton] : []),
              <ToolbarDeleteButton
                key="delete"
                onDelete={handleDelete}
                itemsToDelete={selected}
                pluralizedItemName={t`Notification Templates`}
                warningMessage={t`This deletes the notification templates themselves, for every resource that uses them, not only this one. To stop one notifying here alone, turn its switches off instead.`}
              />,
            ]}
          />
        )}
        toolbarSearchColumns={[
          {
            name: t`Name`,
            key: 'name__icontains',
            isDefault: true,
          },
          {
            name: t`Description`,
            key: 'description__icontains',
          },
          {
            name: t`Notification Type`,
            key: 'or__notification_type',
            // The api's types, read from the one list the rows and the form
            // name them by, so a filter and a row never call a type two
            // different things.
            options: getNotificationTypeOptions(i18n),
          },
          {
            name: t`Created By (Username)`,
            key: 'created_by__username__icontains',
          },
          {
            name: t`Modified By (Username)`,
            key: 'modified_by__username__icontains',
          },
        ]}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG}>
            <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
            <HeaderCell sortKey="notification_type">{t`Type`}</HeaderCell>
            <HeaderCell>{t`Options`}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(notification, index) => (
          <NotificationListItem
            key={notification.id}
            notification={notification}
            detailUrl={`/notifications/${notification.id}/details`}
            canToggleNotifications={
              canToggleNotifications &&
              !loadingToggleIds.includes(notification.id)
            }
            toggleNotification={handleNotificationToggle}
            approvalsTurnedOn={approvalsTemplateIds.includes(notification.id)}
            changedTurnedOn={changedTemplateIds.includes(notification.id)}
            errorTurnedOn={errorTemplateIds.includes(notification.id)}
            startedTurnedOn={startedTemplateIds.includes(notification.id)}
            successTurnedOn={successTemplateIds.includes(notification.id)}
            showApprovalsToggle={showApprovalsToggle}
            showChangedToggle={showChangedToggle}
            isSelected={selected.some((row) => row.id === notification.id)}
            onSelect={() => handleSelect(notification)}
            rowIndex={index}
          />
        )}
      />
      {toggleError && (
        <AlertModal
          variant="error"
          title={t`Error!`}
          isOpen={loadingToggleIds.length === 0}
          onClose={() => setToggleError(null)}
        >
          {t`Failed to toggle notification.`}
          <ErrorDetail error={toggleError} />
        </AlertModal>
      )}
      <AlertModal
        isOpen={Boolean(deletionError)}
        variant="error"
        title={t`Error!`}
        onClose={clearDeletionError}
      >
        {t`Failed to delete one or more notification templates.`}
        <ErrorDetail error={deletionError} />
      </AlertModal>
    </>
  );
}

export default NotificationList;
