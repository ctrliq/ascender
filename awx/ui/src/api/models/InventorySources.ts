import type { QSParams } from 'util/qs';
import type {
  Group,
  Host,
  InventorySource,
  InventoryUpdate,
  Paginated,
} from '../../types/api';
import Base from '../Base';
import NotificationsMixin from '../mixins/Notifications.mixin';
import LaunchUpdateMixin from '../mixins/LaunchUpdate.mixin';
import SchedulesMixin from '../mixins/Schedules.mixin';
import InstanceGroupsMixin from '../mixins/InstanceGroups.mixin';
import type { Http } from '../Base';

class InventorySources extends InstanceGroupsMixin(
  LaunchUpdateMixin(NotificationsMixin(SchedulesMixin(Base)))
) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/inventory_sources/';

    this.createSchedule = this.createSchedule.bind(this);
    this.createSyncStart = this.createSyncStart.bind(this);
    this.destroyGroups = this.destroyGroups.bind(this);
    this.destroyHosts = this.destroyHosts.bind(this);
  }

  // Reached through a mixin, which cannot carry the resource type along, so
  // the calls that answer with an inventory source say so here.
  read<T = Paginated<InventorySource>>(params?: QSParams) {
    return super.read<T>(params);
  }

  readDetail<T = InventorySource>(id: number | string) {
    return super.readDetail<T>(id);
  }

  create<T = InventorySource>(data?: unknown) {
    return super.create<T>(data);
  }

  update<T = InventorySource>(id: number | string, data?: unknown) {
    return super.update<T>(id, data);
  }

  copy<T = InventorySource>(id: number | string, data?: unknown) {
    return super.copy<T>(id, data);
  }

  createSyncStart(sourceId: number | string, extraVars?: unknown) {
    return this.http.post<InventoryUpdate>(
      `${this.baseUrl}${sourceId}/update/`,
      {
        extra_vars: extraVars,
      }
    );
  }

  readGroups(id: number | string) {
    return this.http.get<Paginated<Group>>(`${this.baseUrl}${id}/groups/`);
  }

  readHosts(id: number | string) {
    return this.http.get<Paginated<Host>>(`${this.baseUrl}${id}/hosts/`);
  }

  destroyGroups(id: number | string) {
    return this.http.delete(`${this.baseUrl}${id}/groups/`);
  }

  destroyHosts(id: number | string) {
    return this.http.delete(`${this.baseUrl}${id}/hosts/`);
  }
}
export default InventorySources;
