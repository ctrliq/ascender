import type { QSParams } from 'util/qs';
import type {
  AccessListEntry,
  AdHocCommand,
  ApiEntity,
  Group,
  Host,
  Inventory,
  InventorySource,
  OptionsResponse,
  Paginated,
} from '../../types/api';
import Base from '../Base';
import InstanceGroupsMixin from '../mixins/InstanceGroups.mixin';
import type { Http } from '../Base';

class Inventories extends InstanceGroupsMixin(Base) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/inventories/';

    this.readAccessList = this.readAccessList.bind(this);
    this.readAccessOptions = this.readAccessOptions.bind(this);
    this.readHosts = this.readHosts.bind(this);
    this.readHostDetail = this.readHostDetail.bind(this);
    this.readGroups = this.readGroups.bind(this);
    this.readGroupsOptions = this.readGroupsOptions.bind(this);
    this.promoteGroup = this.promoteGroup.bind(this);
    this.readInputInventories = this.readInputInventories.bind(this);
    this.associateInventory = this.associateInventory.bind(this);
    this.disassociateInventory = this.disassociateInventory.bind(this);
  }

  // Reached through a mixin, which cannot carry the resource type along, so
  // the calls that answer with an inventory say so here.
  read<T = Paginated<Inventory>>(params?: QSParams) {
    return super.read<T>(params);
  }

  readDetail<T = Inventory>(id: number | string) {
    return super.readDetail<T>(id);
  }

  create<T = Inventory>(data?: unknown) {
    return super.create<T>(data);
  }

  update<T = Inventory>(id: number | string, data?: unknown) {
    return super.update<T>(id, data);
  }

  copy<T = Inventory>(id: number | string, data?: unknown) {
    return super.copy<T>(id, data);
  }

  readAccessList(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<AccessListEntry>>(
      `${this.baseUrl}${id}/access_list/`,
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

  createHost(id: number | string, data: unknown) {
    return this.http.post<Host>(`${this.baseUrl}${id}/hosts/`, data);
  }

  readHosts(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<Host>>(`${this.baseUrl}${id}/hosts/`, {
      params,
    });
  }

  async readHostDetail(inventoryId: number | string, hostId: number | string) {
    const {
      data: { results },
    } = await this.http.get<Paginated<Host>>(
      `${this.baseUrl}${inventoryId}/hosts/?id=${hostId}`
    );

    if (Array.isArray(results) && results.length) {
      return results[0];
    }

    throw new Error(
      `How did you get here? Host not found for Inventory ID: ${inventoryId}`
    );
  }

  readGroups(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<Group>>(`${this.baseUrl}${id}/groups/`, {
      params,
    });
  }

  readGroupsOptions(id: number | string) {
    return this.http.options<OptionsResponse>(`${this.baseUrl}${id}/groups/`);
  }

  readHostsOptions(id: number | string) {
    return this.http.options<OptionsResponse>(`${this.baseUrl}${id}/hosts/`);
  }

  promoteGroup(inventoryId: number | string, groupId: number | string) {
    return this.http.post(`${this.baseUrl}${inventoryId}/groups/`, {
      id: groupId,
      disassociate: true,
    });
  }

  readInputInventories(inventoryId: number | string, params?: QSParams) {
    return this.http.get<Paginated<Inventory>>(
      `${this.baseUrl}${inventoryId}/input_inventories/`,
      {
        params,
      }
    );
  }

  readSources(inventoryId: number | string, params?: QSParams) {
    return this.http.get<Paginated<InventorySource>>(
      `${this.baseUrl}${inventoryId}/inventory_sources/`,
      {
        params,
      }
    );
  }

  updateSources(inventoryId: number | string) {
    return this.http.get(
      `${this.baseUrl}${inventoryId}/update_inventory_sources/`
    );
  }

  async readSourceDetail(
    inventoryId: number | string,
    sourceId: number | string
  ) {
    const {
      data: { results },
    } = await this.http.get<Paginated<ApiEntity>>(
      `${this.baseUrl}${inventoryId}/inventory_sources/?id=${sourceId}`
    );

    if (Array.isArray(results) && results.length) {
      return results[0];
    }

    throw new Error(
      `How did you get here? Source not found for Inventory ID: ${inventoryId}`
    );
  }

  syncAllSources(inventoryId: number | string) {
    return this.http.post(
      `${this.baseUrl}${inventoryId}/update_inventory_sources/`
    );
  }

  readAdHocOptions(inventoryId: number | string) {
    return this.http.options<OptionsResponse>(
      `${this.baseUrl}${inventoryId}/ad_hoc_commands/`
    );
  }

  launchAdHocCommands(inventoryId: number | string, values: unknown) {
    return this.http.post<AdHocCommand>(
      `${this.baseUrl}${inventoryId}/ad_hoc_commands/`,
      values
    );
  }

  associateLabel(
    id: number | string,
    label: { id: number; name: string },
    orgId: number | string
  ) {
    return this.http.post(`${this.baseUrl}${id}/labels/`, {
      name: label.name,
      organization: orgId,
    });
  }

  disassociateLabel(id: number | string, label: { id: number; name: string }) {
    return this.http.post(`${this.baseUrl}${id}/labels/`, {
      id: label.id,
      disassociate: true,
    });
  }

  associateInventory(id: number | string, inputInventoryId: number | string) {
    return this.http.post(`${this.baseUrl}${id}/input_inventories/`, {
      id: inputInventoryId,
    });
  }

  disassociateInventory(
    id: number | string,
    inputInventoryId: number | string
  ) {
    return this.http.post(`${this.baseUrl}${id}/input_inventories/`, {
      id: inputInventoryId,
      disassociate: true,
    });
  }
}

export default Inventories;
