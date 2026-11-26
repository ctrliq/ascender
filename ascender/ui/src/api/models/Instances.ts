import type { QSParams } from 'util/qs';
import type {
  Instance,
  InstanceGroup,
  OptionsResponse,
  Paginated,
  ReceptorAddress,
} from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class Instances extends Base<Instance> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/instances/';

    this.readHealthCheckDetail = this.readHealthCheckDetail.bind(this);
    this.healthCheck = this.healthCheck.bind(this);
    this.readInstanceGroup = this.readInstanceGroup.bind(this);
    this.readInstanceGroups = this.readInstanceGroups.bind(this);
    this.readInstanceGroupOptions = this.readInstanceGroupOptions.bind(this);
    this.associateInstanceGroup = this.associateInstanceGroup.bind(this);
    this.disassociateInstanceGroup = this.disassociateInstanceGroup.bind(this);
    this.readReceptorAddresses = this.readReceptorAddresses.bind(this);
    this.deprovisionInstance = this.deprovisionInstance.bind(this);
  }

  healthCheck(instanceId: number | string) {
    return this.http.post(`${this.baseUrl}${instanceId}/health_check/`);
  }

  readHealthCheckDetail(instanceId: number | string) {
    return this.http.get<Instance>(
      `${this.baseUrl}${instanceId}/health_check/`
    );
  }

  readPeers(instanceId: number | string, params?: QSParams) {
    return this.http.get<Paginated<ReceptorAddress>>(
      `${this.baseUrl}${instanceId}/peers/`,
      { params }
    );
  }

  readInstanceGroup(instanceId: number | string) {
    return this.http.get<Paginated<InstanceGroup>>(
      `${this.baseUrl}${instanceId}/instance_groups/`
    );
  }

  /**
   * The groups this instance belongs to, one page at a time. The same list as
   * readInstanceGroup, taking the query a paged, searchable list sends.
   */
  readInstanceGroups(instanceId: number | string, params?: QSParams) {
    return this.http.get<Paginated<InstanceGroup>>(
      `${this.baseUrl}${instanceId}/instance_groups/`,
      { params }
    );
  }

  readInstanceGroupOptions(instanceId: number | string) {
    return this.http.options<OptionsResponse>(
      `${this.baseUrl}${instanceId}/instance_groups/`
    );
  }

  /** Adds the instance to a group, the same link the group's own list adds. */
  associateInstanceGroup(
    instanceId: number | string,
    instanceGroupId: number | string
  ) {
    return this.http.post(`${this.baseUrl}${instanceId}/instance_groups/`, {
      id: instanceGroupId,
    });
  }

  disassociateInstanceGroup(
    instanceId: number | string,
    instanceGroupId: number | string
  ) {
    return this.http.post(`${this.baseUrl}${instanceId}/instance_groups/`, {
      id: instanceGroupId,
      disassociate: true,
    });
  }

  readReceptorAddresses(instanceId: number | string, params?: QSParams) {
    return this.http.get<Paginated<ReceptorAddress>>(
      `${this.baseUrl}${instanceId}/receptor_addresses/`,
      { params }
    );
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
