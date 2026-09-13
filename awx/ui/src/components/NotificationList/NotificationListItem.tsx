import type { NotificationTemplate } from 'types/api';
import React from 'react';

import { useLingui } from '@lingui/react/macro';

import { Link } from 'react-router';
import { Switch } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { ActionsTd, ActionItem } from '../PaginatedTable';

/** A notification template as its list row reads it. */
export interface NotificationListItemProps {
  canToggleNotifications: boolean;
  notification: NotificationTemplate;
  detailUrl: React.ReactNode;
  approvalsTurnedOn?: boolean;
  startedTurnedOn?: boolean;
  successTurnedOn?: boolean;
  errorTurnedOn?: boolean;
  changedTurnedOn?: boolean;
  /** Turns one of this template's five notifications on or off. */
  toggleNotification: (
    id: number,
    isCurrentlyOn: boolean,
    status: 'started' | 'success' | 'error' | 'approvals' | 'changed'
  ) => unknown;
  /** Human readable names for each notification type, keyed by its value. */
  typeLabels: Record<string, string>;
  showApprovalsToggle?: boolean;
  showChangedToggle?: boolean;
  [key: string]: unknown;
}

function NotificationListItem({
  canToggleNotifications,
  notification,
  detailUrl,
  approvalsTurnedOn = false,
  startedTurnedOn = false,
  successTurnedOn = false,
  errorTurnedOn = false,
  changedTurnedOn = false,
  toggleNotification,

  typeLabels,
  showApprovalsToggle = false,
  showChangedToggle = false,
}: NotificationListItemProps) {
  const { t } = useLingui();
  return (
    <Tr
      id={`notification-row-${notification.id}`}
      ouiaId={`notification-row-${notification.id}`}
    >
      <Td id={`notification-${notification.id}`} dataLabel={t`Name`}>
        <Link to={`${detailUrl}`}>
          <b>{notification.name}</b>
        </Link>
      </Td>
      <Td dataLabel={t`Type`}>
        {typeLabels[notification.notification_type as string]}
      </Td>
      <ActionsTd
        dataLabel={t`Options`}
        gridColumns="120px 120px 120px 120px 120px"
      >
        <ActionItem visible={showApprovalsToggle}>
          <Switch
            id={`notification-${notification.id}-approvals-toggle`}
            ouiaId={`notification-${notification.id}-approvals-toggle`}
            label={t`Approval`}

            isChecked={approvalsTurnedOn}
            isDisabled={!canToggleNotifications}
            onChange={() =>
              toggleNotification(
                notification.id,
                approvalsTurnedOn,
                'approvals'
              )
            }
            aria-label={t`Toggle notification approvals`}
          />
        </ActionItem>
        <ActionItem visible>
          <Switch
            id={`notification-${notification.id}-started-toggle`}
            ouiaId={`notification-${notification.id}-started-toggle`}
            label={t`Start`}

            isChecked={startedTurnedOn}
            isDisabled={!canToggleNotifications}
            onChange={() =>
              toggleNotification(notification.id, startedTurnedOn, 'started')
            }
            aria-label={t`Toggle notification start`}
          />
        </ActionItem>
        <ActionItem visible>
          <Switch
            id={`notification-${notification.id}-success-toggle`}
            ouiaId={`notification-${notification.id}-success-toggle`}
            label={t`Success`}

            isChecked={successTurnedOn}
            isDisabled={!canToggleNotifications}
            onChange={() =>
              toggleNotification(notification.id, successTurnedOn, 'success')
            }
            aria-label={t`Toggle notification success`}
          />
        </ActionItem>
        <ActionItem visible>
          <Switch
            id={`notification-${notification.id}-error-toggle`}
            ouiaId={`notification-${notification.id}-error-toggle`}
            label={t`Failure`}

            isChecked={errorTurnedOn}
            isDisabled={!canToggleNotifications}
            onChange={() =>
              toggleNotification(notification.id, errorTurnedOn, 'error')
            }
            aria-label={t`Toggle notification failure`}
          />
        </ActionItem>
        <ActionItem visible={showChangedToggle}>
          <Switch
            id={`notification-${notification.id}-changed-toggle`}
            ouiaId={`notification-${notification.id}-changed-toggle`}
            label={t`Changed`}

            isChecked={changedTurnedOn}
            isDisabled={!canToggleNotifications}
            onChange={() =>
              toggleNotification(notification.id, changedTurnedOn, 'changed')
            }
            aria-label={t`Toggle notification changed`}
          />
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}

export default NotificationListItem;
