import Base from '../Base';
import type { Http } from '../Base';
import type { QSParams } from 'util/qs';

class Users extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/users/';
  }

  associateRole(userId: number | string, roleId: number | string) {
    return this.http.post(`${this.baseUrl}${userId}/roles/`, {
      id: roleId,
    });
  }

  createToken(userId: number | string, data: unknown) {
    return this.http.post(`${this.baseUrl}${userId}/authorized_tokens/`, data);
  }

  disassociateRole(userId: number | string, roleId: number | string) {
    return this.http.post(`${this.baseUrl}${userId}/roles/`, {
      id: roleId,
      disassociate: true,
    });
  }

  readOrganizations(userId: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${userId}/organizations/`, {
      params,
    });
  }

  readOrganizationOptions(userId: number | string, params?: QSParams) {
    return this.http.options(`${this.baseUrl}${userId}/organizations/`, {
      params,
    });
  }

  readRoles(userId: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${userId}/roles/`, {
      params,
    });
  }

  readRoleOptions(userId: number | string) {
    return this.http.options(`${this.baseUrl}${userId}/roles/`);
  }

  readTeams(userId: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${userId}/teams/`, {
      params,
    });
  }

  readTeamsOptions(userId: number | string) {
    return this.http.options(`${this.baseUrl}${userId}/teams/`);
  }

  readTokens(userId: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${userId}/tokens/`, {
      params,
    });
  }

  readAdminOfOrganizations(userId: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${userId}/admin_of_organizations/`, {
      params,
    });
  }

  readTokenOptions(userId: number | string) {
    return this.http.options(`${this.baseUrl}${userId}/tokens/`);
  }
}

export default Users;
