import type { Paginated, Role, Team, User } from '../../types/api';
import type { QSParams } from '../../util/qs';
import Base from '../Base';
import type { Http } from '../Base';

class Roles extends Base<Role> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/roles/';
  }

  /** Who holds this role directly, rather than through a team. */
  readUsers(roleId: number | string, params?: QSParams) {
    return this.http.get<Paginated<User>>(`${this.baseUrl}${roleId}/users/`, {
      params,
    });
  }

  /** The teams holding this role, whose members hold it with them. */
  readTeams(roleId: number | string, params?: QSParams) {
    return this.http.get<Paginated<Team>>(`${this.baseUrl}${roleId}/teams/`, {
      params,
    });
  }

  disassociateUserRole(roleId: number | string, userId: number | string) {
    return this.http.post(`${this.baseUrl}${roleId}/users/`, {
      disassociate: true,
      id: userId,
    });
  }

  disassociateTeamRole(roleId: number | string, teamId: number | string) {
    return this.http.post(`${this.baseUrl}${roleId}/teams/`, {
      disassociate: true,
      id: teamId,
    });
  }
}
export default Roles;
