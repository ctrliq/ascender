import Base from '../Base';
import type { Http } from '../Base';
import type { QSParams } from 'util/qs';

class Instances extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/instances/';

    this.readHealthCheckDetail = this.readHealthCheckDetail.bind(this);
    this.healthCheck = this.healthCheck.bind(this);
    this.readInstanceGroup = this.readInstanceGroup.bind(this);
    this.readReceptorAddresses = this.readReceptorAddresses.bind(this);
    this.deprovisionInstance = this.deprovisionInstance.bind(this);
  }

  healthCheck(instanceId: number | string) {
    return this.http.post(`${this.baseUrl}${instanceId}/health_check/`);
  }

  readHealthCheckDetail(instanceId: number | string) {
    return this.http.get(`${this.baseUrl}${instanceId}/health_check/`);
  }

  readPeers(instanceId: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${instanceId}/peers/`, { params });
  }

  readInstanceGroup(instanceId: number | string) {
    return this.http.get(`${this.baseUrl}${instanceId}/instance_groups/`);
  }

  readReceptorAddresses(instanceId: number | string) {
    return this.http.get(`${this.baseUrl}${instanceId}/receptor_addresses/`);
  }

  updateReceptorAddresses(instanceId: number | string, data: unknown) {
    return this.http.post(
      `${this.baseUrl}${instanceId}/receptor_addresses/`,
      data
    );
  }

  deprovisionInstance(instanceId: number | string) {
    return this.http.patch(`${this.baseUrl}${instanceId}/`, {
      node_state: 'deprovisioning',
    });
  }
}

export default Instances;
