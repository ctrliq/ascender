import type { QSParams } from 'util/qs';
import type {
  Instance,
  InstanceGroup,
  OptionsResponse,
  Paginated,
  UnifiedJob,
} from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class InstanceGroups extends Base<InstanceGroup> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/instance_groups/';

    this.associateInstance = this.associateInstance.bind(this);
    this.disassociateInstance = this.disassociateInstance.bind(this);
    this.readInstanceOptions = this.readInstanceOptions.bind(this);
    this.readInstanceGroupOptions = this.readInstanceGroupOptions.bind(this);
    this.readInstances = this.readInstances.bind(this);
    this.readJobs = this.readJobs.bind(this);
  }

  associateInstance(
    instanceGroupId: number | string,
    instanceId: number | string
  ) {
    return this.http.post(`${this.baseUrl}${instanceGroupId}/instances/`, {
      id: instanceId,
    });
  }

  disassociateInstance(
    instanceGroupId: number | string,
    instanceId: number | string
  ) {
    return this.http.post(`${this.baseUrl}${instanceGroupId}/instances/`, {
      id: instanceId,
      disassociate: true,
    });
  }

  readInstances(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<Instance>>(
      `${this.baseUrl}${id}/instances/`,
      { params }
    );
  }

  readInstanceOptions(id: number | string) {
    return this.http.options<OptionsResponse>(
      `${this.baseUrl}${id}/instances/`
    );
  }

  readInstanceGroupOptions(id: number | string) {
    return this.http.options<OptionsResponse>(`${this.baseUrl}${id}/`);
  }

  readJobs(id: number | string) {
    return this.http.get<Paginated<UnifiedJob>>(`${this.baseUrl}${id}/jobs/`);
  }
}

export default InstanceGroups;
