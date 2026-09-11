import Base from '../Base';
import type { Http } from '../Base';
import type { QSParams } from 'util/qs';

class Teams extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/teams/';
  }

  associateRole(teamId: number | string, roleId: number | string) {
    return this.http.post(`${this.baseUrl}${teamId}/roles/`, {
      id: roleId,
    });
  }

  disassociateRole(teamId: number | string, roleId: number | string) {
    return this.http.post(`${this.baseUrl}${teamId}/roles/`, {
      id: roleId,
      disassociate: true,
    });
  }

  readRoles(teamId: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${teamId}/roles/`, {
      params,
    });
  }

  readRoleOptions(teamId: number | string) {
    return this.http.options(`${this.baseUrl}${teamId}/roles/`);
  }

  readAccessList(teamId: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${teamId}/access_list/`, {
      params,
    });
  }

  readAccessOptions(id: number | string) {
    return this.http.options(`${this.baseUrl}${id}/access_list/`);
  }

  readUsersAccessOptions(teamId: number | string) {
    return this.http.options(`${this.baseUrl}${teamId}/users/`);
  }
}

export default Teams;
