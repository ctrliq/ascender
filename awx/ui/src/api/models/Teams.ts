import type { QSParams } from 'util/qs';
import type {
  AccessListEntry,
  OptionsResponse,
  Paginated,
  Role,
  Team,
} from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class Teams extends Base<Team> {
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
    return this.http.get<Paginated<Role>>(`${this.baseUrl}${teamId}/roles/`, {
      params,
    });
  }

  readRoleOptions(teamId: number | string) {
    return this.http.options<OptionsResponse>(
      `${this.baseUrl}${teamId}/roles/`
    );
  }

  readAccessList(teamId: number | string, params?: QSParams) {
    return this.http.get<Paginated<AccessListEntry>>(
      `${this.baseUrl}${teamId}/access_list/`,
      {
        params,
      }
    );
  }

  readAccessOptions(id: number | string) {
    return this.http.options<OptionsResponse>(
      `${this.baseUrl}${id}/access_list/`
    );
  }

  readUsersAccessOptions(teamId: number | string) {
    return this.http.options<OptionsResponse>(
      `${this.baseUrl}${teamId}/users/`
    );
  }
}

export default Teams;
