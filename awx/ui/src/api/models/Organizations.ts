import type { QSParams } from 'util/qs';
import type {
  AccessListEntry,
  Credential,
  ExecutionEnvironment,
  NotificationTemplate,
  OptionsResponse,
  Organization,
  Paginated,
  Team,
  User,
} from '../../types/api';
import Base from '../Base';
import NotificationsMixin from '../mixins/Notifications.mixin';
import InstanceGroupsMixin from '../mixins/InstanceGroups.mixin';
import type { Http } from '../Base';

class Organizations extends InstanceGroupsMixin(NotificationsMixin(Base)) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/organizations/';
  }

  // Reached through a mixin, which cannot carry the resource type along, so
  // the calls that answer with an organization say so here.
  read<T = Paginated<Organization>>(params?: QSParams) {
    return super.read<T>(params);
  }

  readDetail<T = Organization>(id: number | string) {
    return super.readDetail<T>(id);
  }

  create<T = Organization>(data?: unknown) {
    return super.create<T>(data);
  }

  update<T = Organization>(id: number | string, data?: unknown) {
    return super.update<T>(id, data);
  }

  copy<T = Organization>(id: number | string, data?: unknown) {
    return super.copy<T>(id, data);
  }

  readAccessList(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<AccessListEntry>>(
      `${this.baseUrl}${id}/access_list/`,
      { params }
    );
  }

  readAccessOptions(id: number | string) {
    return this.http.options<OptionsResponse>(
      `${this.baseUrl}${id}/access_list/`
    );
  }

  readTeams(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<Team>>(`${this.baseUrl}${id}/teams/`, {
      params,
    });
  }

  readTeamsOptions(id: number | string) {
    return this.http.options<OptionsResponse>(`${this.baseUrl}${id}/teams/`);
  }

  readGalaxyCredentials(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<Credential>>(
      `${this.baseUrl}${id}/galaxy_credentials/`,
      {
        params,
      }
    );
  }

  readExecutionEnvironments(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<ExecutionEnvironment>>(
      `${this.baseUrl}${id}/execution_environments/`,
      {
        params,
      }
    );
  }

  readExecutionEnvironmentsOptions(id: number | string) {
    return this.http.options<OptionsResponse>(
      `${this.baseUrl}${id}/execution_environments/`
    );
  }

  createUser(id: number | string, data: unknown) {
    return this.http.post<User>(`${this.baseUrl}${id}/users/`, data);
  }

  readNotificationTemplatesApprovals(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<NotificationTemplate>>(
      `${this.baseUrl}${id}/notification_templates_approvals/`,
      { params }
    );
  }

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

  associateGalaxyCredential(
    resourceId: number | string,
    credentialId: number | string
  ) {
    return this.http.post(`${this.baseUrl}${resourceId}/galaxy_credentials/`, {
      id: credentialId,
    });
  }

  disassociateGalaxyCredential(
    resourceId: number | string,
    credentialId: number | string
  ) {
    return this.http.post(`${this.baseUrl}${resourceId}/galaxy_credentials/`, {
      id: credentialId,
      disassociate: true,
    });
  }

  readAdmins(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<User>>(`${this.baseUrl}${id}/admins/`, {
      params,
    });
  }
}

export default Organizations;
