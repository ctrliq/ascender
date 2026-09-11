import type { QSParams } from 'util/qs';
import type { OptionsResponse } from '../../types/api';
import type { BaseConstructor } from '../Base';

const NotificationsMixin = <T extends BaseConstructor>(parent: T) =>
  class extends parent {
    readOptionsNotificationTemplates(id: number | string) {
      return this.http.options<OptionsResponse>(
        `${this.baseUrl}${id}/notification_templates/`
      );
    }

    readNotificationTemplates(id: number | string, params?: QSParams) {
      return this.http.get(
        `${this.baseUrl}${id}/notification_templates/`,
        params
      );
    }

    readNotificationTemplatesStarted(id: number | string, params?: QSParams) {
      return this.http.get(
        `${this.baseUrl}${id}/notification_templates_started/`,
        { params }
      );
    }

    readNotificationTemplatesSuccess(id: number | string, params?: QSParams) {
      return this.http.get(
        `${this.baseUrl}${id}/notification_templates_success/`,
        { params }
      );
    }

    readNotificationTemplatesError(id: number | string, params?: QSParams) {
      return this.http.get(
        `${this.baseUrl}${id}/notification_templates_error/`,
        { params }
      );
    }

    readNotificationTemplatesChanged(id: number | string, params?: QSParams) {
      return this.http.get(
        `${this.baseUrl}${id}/notification_templates_changed/`,
        { params }
      );
    }

    // The approvals pair, which associateNotificationTemplate below has always
    // dispatched to and which never existed, so toggling the Approval switch
    // on a workflow template threw a TypeError instead of calling the API.
    // The endpoint has been there the whole time.
    associateNotificationTemplatesApprovals(
      resourceId: number | string,
      notificationId: number | string
    ) {
      return this.http.post(
        `${this.baseUrl}${resourceId}/notification_templates_approvals/`,
        { id: notificationId }
      );
    }

    disassociateNotificationTemplatesApprovals(
      resourceId: number | string,
      notificationId: number | string
    ) {
      return this.http.post(
        `${this.baseUrl}${resourceId}/notification_templates_approvals/`,
        { id: notificationId, disassociate: true }
      );
    }

    associateNotificationTemplatesStarted(
      resourceId: number | string,
      notificationId: number | string
    ) {
      return this.http.post(
        `${this.baseUrl}${resourceId}/notification_templates_started/`,
        { id: notificationId }
      );
    }

    disassociateNotificationTemplatesStarted(
      resourceId: number | string,
      notificationId: number | string
    ) {
      return this.http.post(
        `${this.baseUrl}${resourceId}/notification_templates_started/`,
        { id: notificationId, disassociate: true }
      );
    }

    associateNotificationTemplatesSuccess(
      resourceId: number | string,
      notificationId: number | string
    ) {
      return this.http.post(
        `${this.baseUrl}${resourceId}/notification_templates_success/`,
        { id: notificationId }
      );
    }

    disassociateNotificationTemplatesSuccess(
      resourceId: number | string,
      notificationId: number | string
    ) {
      return this.http.post(
        `${this.baseUrl}${resourceId}/notification_templates_success/`,
        { id: notificationId, disassociate: true }
      );
    }

    associateNotificationTemplatesError(
      resourceId: number | string,
      notificationId: number | string
    ) {
      return this.http.post(
        `${this.baseUrl}${resourceId}/notification_templates_error/`,
        { id: notificationId }
      );
    }

    disassociateNotificationTemplatesError(
      resourceId: number | string,
      notificationId: number | string
    ) {
      return this.http.post(
        `${this.baseUrl}${resourceId}/notification_templates_error/`,
        { id: notificationId, disassociate: true }
      );
    }

    associateNotificationTemplatesChanged(
      resourceId: number | string,
      notificationId: number | string
    ) {
      return this.http.post(
        `${this.baseUrl}${resourceId}/notification_templates_changed/`,
        { id: notificationId }
      );
    }

    disassociateNotificationTemplatesChanged(
      resourceId: number | string,
      notificationId: number | string
    ) {
      return this.http.post(
        `${this.baseUrl}${resourceId}/notification_templates_changed/`,
        { id: notificationId, disassociate: true }
      );
    }

    /**
     * This is a helper method meant to simplify setting the "on" status of
     * a related notification.
     *
     * @param[resourceId] - id of the base resource
     * @param[notificationId] - id of the notification
     * @param[notificationType] - the type of notification, options are "approvals",
     *   "started", "success", "error" and "changed"
     */
    associateNotificationTemplate(
      resourceId: number | string,
      notificationId: number | string,
      notificationType: string
    ) {
      if (notificationType === 'approvals') {
        return this.associateNotificationTemplatesApprovals(
          resourceId,
          notificationId
        );
      }

      if (notificationType === 'started') {
        return this.associateNotificationTemplatesStarted(
          resourceId,
          notificationId
        );
      }

      if (notificationType === 'success') {
        return this.associateNotificationTemplatesSuccess(
          resourceId,
          notificationId
        );
      }

      if (notificationType === 'error') {
        return this.associateNotificationTemplatesError(
          resourceId,
          notificationId
        );
      }

      if (notificationType === 'changed') {
        return this.associateNotificationTemplatesChanged(
          resourceId,
          notificationId
        );
      }

      throw new Error(
        `Unsupported notificationType for association: ${notificationType}`
      );
    }

    /**
     * This is a helper method meant to simplify setting the "off" status of
     * a related notification.
     *
     * @param[resourceId] - id of the base resource
     * @param[notificationId] - id of the notification
     * @param[notificationType] - the type of notification, options are "approvals",
     *   "started", "success", "error" and "changed"
     */
    disassociateNotificationTemplate(
      resourceId: number | string,
      notificationId: number | string,
      notificationType: string
    ) {
      if (notificationType === 'approvals') {
        return this.disassociateNotificationTemplatesApprovals(
          resourceId,
          notificationId
        );
      }

      if (notificationType === 'started') {
        return this.disassociateNotificationTemplatesStarted(
          resourceId,
          notificationId
        );
      }

      if (notificationType === 'success') {
        return this.disassociateNotificationTemplatesSuccess(
          resourceId,
          notificationId
        );
      }

      if (notificationType === 'error') {
        return this.disassociateNotificationTemplatesError(
          resourceId,
          notificationId
        );
      }

      if (notificationType === 'changed') {
        return this.disassociateNotificationTemplatesChanged(
          resourceId,
          notificationId
        );
      }

      throw new Error(
        `Unsupported notificationType for disassociation: ${notificationType}`
      );
    }
  };

export default NotificationsMixin;
