import type { Role } from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class Roles extends Base<Role> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/roles/';
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
