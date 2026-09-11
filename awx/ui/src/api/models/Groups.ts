import type { QSParams } from 'util/qs';
import Base from '../Base';
import type { Http } from '../Base';

class Groups extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/groups/';

    this.associateHost = this.associateHost.bind(this);
    this.createHost = this.createHost.bind(this);
    this.readAllHosts = this.readAllHosts.bind(this);
    this.disassociateHost = this.disassociateHost.bind(this);
  }

  associateHost(id: number | string, hostId: number | string) {
    return this.http.post(`${this.baseUrl}${id}/hosts/`, {
      id: hostId,
    });
  }

  createHost(id: number | string, data: unknown) {
    return this.http.post(`${this.baseUrl}${id}/hosts/`, data);
  }

  readAllHosts(id: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${id}/all_hosts/`, {
      params,
    });
  }

  disassociateHost(id: number | string, host: { id: number }) {
    return this.http.post(`${this.baseUrl}${id}/hosts/`, {
      id: host.id,
      disassociate: true,
    });
  }

  readChildren(id: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${id}/children/`, { params });
  }

  associateChildGroup(id: number | string, childId: number | string) {
    return this.http.post(`${this.baseUrl}${id}/children/`, { id: childId });
  }

  disassociateChildGroup(id: number | string, childId: number | string) {
    return this.http.post(`${this.baseUrl}${id}/children/`, {
      disassociate: id,
      id: childId,
    });
  }

  readPotentialGroups(id: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${id}/potential_children/`, {
      params,
    });
  }
}

export default Groups;
