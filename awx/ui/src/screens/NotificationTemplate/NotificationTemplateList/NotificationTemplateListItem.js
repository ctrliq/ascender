import 'styled-components/macro';
import React, { useState, useEffect, useCallback } from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Link } from 'react-router-dom';
import { Button } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { PencilAltIcon, BellIcon } from '@patternfly/react-icons';
import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import { timeOfDay } from 'util/dates';
import { NotificationTemplatesAPI, NotificationsAPI } from 'api';
import StatusLabel from 'components/StatusLabel';
import CopyButton from 'components/CopyButton';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { NOTIFICATION_TYPES } from '../constants';

const NUM_RETRIES = 25;
const RETRY_TIMEOUT = 5000;

function NotificationTemplateListItem({
  onAddToast,
  template,
  detailUrl,
  fetchTemplates,
  isSelected,
  onSelect,
  rowIndex,
}) {
  const { i18n } = useLingui();
  const recentNotifications = template.summary_fields?.recent_notifications;
  const latestStatus = recentNotifications
    ? recentNotifications[0]?.status
    : null;
  const [status, setStatus] = useState(latestStatus);
  const [isCopyDisabled, setIsCopyDisabled] = useState(false);

  const copyTemplate = useCallback(async () => {
    await NotificationTemplatesAPI.copy(template.id, {
      name: `${template.name} @ ${timeOfDay()}`,
    });
    await fetchTemplates();
  }, [template.id, template.name, fetchTemplates]);

  const handleCopyStart = useCallback(() => {
    setIsCopyDisabled(true);
  }, []);

  const handleCopyFinish = useCallback(() => {
    setIsCopyDisabled(false);
  }, []);

  useEffect(() => {
    setStatus(latestStatus);
  }, [latestStatus]);

  const {
    request: sendTestNotification,
    isLoading,
    error,
  } = useRequest(
    useCallback(async () => {
      const request = NotificationTemplatesAPI.test(template.id);
      setStatus('running');
      let retries = NUM_RETRIES;
      const {
        data: { notification: notificationId },
      } = await request;

      async function pollForStatusChange() {
        const { data: notification } =
          await NotificationsAPI.readDetail(notificationId);
        if (notification.status !== 'pending') {
          onAddToast(notification);
          setStatus(notification.status);
          return;
        }
        retries--;
        if (retries > 0) {
          setTimeout(pollForStatusChange, RETRY_TIMEOUT);
        }
      }

      setTimeout(pollForStatusChange, RETRY_TIMEOUT);
    }, [template.id, onAddToast])
  );

  const { error: sendTestError, dismissError } = useDismissableError(error);

  useEffect(() => {
    if (error) {
      setStatus('error');
    }
  }, [error]);

  const labelId = `template-name-${template.id}`;

  return (
    <>
      <Tr
        id={`notification-template-row-${template.id}`}
        ouiaId={`notification-template-row-${template.id}`}
      >
        <Td
          select={{
            rowIndex,
            isSelected,
            onSelect,
          }}
          dataLabel={i18n._(msg`Selected`)}
        />
        <TdBreakWord id={labelId} dataLabel={i18n._(msg`Name`)}>
          <Link to={`${detailUrl}`}>
            <b>{template.name}</b>
          </Link>
        </TdBreakWord>
        <Td dataLabel={i18n._(msg`Status`)}>
          {status && <StatusLabel status={status} />}
        </Td>
        <Td dataLabel={i18n._(msg`Type`)}>
          {NOTIFICATION_TYPES[template.notification_type] ||
            template.notification_type}
        </Td>
        <Td dataLabel={i18n._(msg`Oragnization`)}>
          <Link
            to={`/organizations/${template.summary_fields.organization.id}/details`}
          >
            <b>{template.summary_fields.organization.name}</b>
          </Link>
        </Td>
        <ActionsTd dataLabel={i18n._(msg`Actions`)}>
          <ActionItem visible tooltip={i18n._(msg`Test notification`)}>
            <Button
              ouiaId={`notification-test-button-${template.id}`}
              aria-label={i18n._(msg`Test Notification`)}
              variant="plain"
              onClick={sendTestNotification}
              isDisabled={isLoading || status === 'running'}
            >
              <BellIcon />
            </Button>
          </ActionItem>
          <ActionItem
            visible={template.summary_fields.user_capabilities.edit}
            tooltip={i18n._(msg`Edit`)}
          >
            <Button
              ouiaId={`notification-edit-button-${template.id}`}
              aria-label={i18n._(msg`Edit Notification Template`)}
              variant="plain"
              component={Link}
              to={`/notification_templates/${template.id}/edit`}
            >
              <PencilAltIcon />
            </Button>
          </ActionItem>
          <ActionItem
            visible={template.summary_fields.user_capabilities.copy}
            tooltip={i18n._(msg`Copy Notification Template`)}
          >
            <CopyButton
              ouiaId={`notification-copy-button-${template.id}`}
              copyItem={copyTemplate}
              isCopyDisabled={isCopyDisabled}
              onCopyStart={handleCopyStart}
              onCopyFinish={handleCopyFinish}
              errorMessage={i18n._(msg`Failed to copy template.`)}
            />
          </ActionItem>
        </ActionsTd>
      </Tr>
      {sendTestError && (
        <AlertModal
          isOpen
          variant="error"
          title={i18n._(msg`Error!`)}
          onClose={dismissError}
        >
          {i18n._(msg`Failed to send test notification.`)}
          <ErrorDetail error={sendTestError} />
        </AlertModal>
      )}
    </>
  );
}

export default NotificationTemplateListItem;
