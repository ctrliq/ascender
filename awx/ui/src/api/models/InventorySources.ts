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

  createSyncStart(sourceId: number | string, extraVars?: unknown) {
    return this.http.post(`${this.baseUrl}${sourceId}/update/`, {
      extra_vars: extraVars,
    });
  }

  readGroups(id: number | string) {
    return this.http.get(`${this.baseUrl}${id}/groups/`);
  }

  readHosts(id: number | string) {
    return this.http.get(`${this.baseUrl}${id}/hosts/`);
  }

  destroyGroups(id: number | string) {
    return this.http.delete(`${this.baseUrl}${id}/groups/`);
  }

  destroyHosts(id: number | string) {
    return this.http.delete(`${this.baseUrl}${id}/hosts/`);
  }
}
export default InventorySources;
