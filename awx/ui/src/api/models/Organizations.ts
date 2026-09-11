import Base from '../Base';
import NotificationsMixin from '../mixins/Notifications.mixin';
import InstanceGroupsMixin from '../mixins/InstanceGroups.mixin';
import type { Http } from '../Base';
import type { QSParams } from 'util/qs';

class Organizations extends InstanceGroupsMixin(NotificationsMixin(Base)) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/organizations/';
  }

  readAccessList(id: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${id}/access_list/`, { params });
  }

  readAccessOptions(id: number | string) {
    return this.http.options(`${this.baseUrl}${id}/access_list/`);
  }

  readTeams(id: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${id}/teams/`, { params });
  }

  readTeamsOptions(id: number | string) {
    return this.http.options(`${this.baseUrl}${id}/teams/`);
  }

  readGalaxyCredentials(id: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${id}/galaxy_credentials/`, {
      params,
    });
  }

  readExecutionEnvironments(id: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${id}/execution_environments/`, {
      params,
    });
  }

  readExecutionEnvironmentsOptions(id: number | string) {
    return this.http.options(`${this.baseUrl}${id}/execution_environments/`);
  }

  createUser(id: number | string, data: unknown) {
    return this.http.post(`${this.baseUrl}${id}/users/`, data);
  }

  readNotificationTemplatesApprovals(id: number | string, params?: QSParams) {
    return this.http.get(
      `${this.baseUrl}${id}/notification_templates_approvals/`,
      { params }
    );
  }

  associateNotificationTemplatesApprovals(resourceId: number | string, notificationId: number | string) {
    return this.http.post(
      `${this.baseUrl}${resourceId}/notification_templates_approvals/`,
      { id: notificationId }
    );
  }

  disassociateNotificationTemplatesApprovals(resourceId: number | string, notificationId: number | string) {
    return this.http.post(
      `${this.baseUrl}${resourceId}/notification_templates_approvals/`,
      { id: notificationId, disassociate: true }
    );
  }

  associateGalaxyCredential(resourceId: number | string, credentialId: number | string) {
    return this.http.post(`${this.baseUrl}${resourceId}/galaxy_credentials/`, {
      id: credentialId,
    });
  }

  disassociateGalaxyCredential(resourceId: number | string, credentialId: number | string) {
    return this.http.post(`${this.baseUrl}${resourceId}/galaxy_credentials/`, {
      id: credentialId,
      disassociate: true,
    });
  }

  readAdmins(id: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${id}/admins/`, { params });
  }
}

export default Organizations;
