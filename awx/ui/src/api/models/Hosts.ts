import type { QSParams } from 'util/qs';
import type { Group, Host, OptionsResponse, Paginated } from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class Hosts extends Base<Host> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/hosts/';

    this.readFacts = this.readFacts.bind(this);
    this.readAllGroups = this.readAllGroups.bind(this);
    this.readGroupsOptions = this.readGroupsOptions.bind(this);
    this.associateGroup = this.associateGroup.bind(this);
    this.disassociateGroup = this.disassociateGroup.bind(this);
  }

  readFacts(id: number | string) {
    return this.http.get<Record<string, unknown>>(
      `${this.baseUrl}${id}/ansible_facts/`
    );
  }

  readAllGroups(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<Group>>(`${this.baseUrl}${id}/all_groups/`, {
      params,
    });
  }

  readGroups(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<Group>>(`${this.baseUrl}${id}/groups/`, {
      params,
    });
  }

  readGroupsOptions(id: number | string) {
    return this.http.options<OptionsResponse>(`${this.baseUrl}${id}/groups/`);
  }

  associateGroup(id: number | string, groupId: number | string) {
    return this.http.post(`${this.baseUrl}${id}/groups/`, { id: groupId });
  }

  disassociateGroup(id: number | string, group: { id: number }) {
    return this.http.post(`${this.baseUrl}${id}/groups/`, {
      id: group.id,
      disassociate: true,
    });
  }
}

export default Hosts;
