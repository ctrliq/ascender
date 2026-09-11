import Base from '../Base';
import NotificationsMixin from '../mixins/Notifications.mixin';
import LaunchUpdateMixin from '../mixins/LaunchUpdate.mixin';
import SchedulesMixin from '../mixins/Schedules.mixin';
import type { Http } from '../Base';
import type { QSParams } from 'util/qs';

class Projects extends SchedulesMixin(
  LaunchUpdateMixin(NotificationsMixin(Base))
) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/projects/';

    this.readAccessList = this.readAccessList.bind(this);
    this.readAccessOptions = this.readAccessOptions.bind(this);
    this.readInventories = this.readInventories.bind(this);
    this.readPlaybooks = this.readPlaybooks.bind(this);
    this.readSync = this.readSync.bind(this);
    this.sync = this.sync.bind(this);
    this.createSchedule = this.createSchedule.bind(this);
  }

  readAccessList(id: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${id}/access_list/`, { params });
  }

  readAccessOptions(id: number | string) {
    return this.http.options(`${this.baseUrl}${id}/access_list/`);
  }

  readInventories(id: number | string) {
    return this.http.get(`${this.baseUrl}${id}/inventories/`);
  }

  readPlaybooks(id: number | string) {
    return this.http.get(`${this.baseUrl}${id}/playbooks/`);
  }

  readSync(id: number | string) {
    return this.http.get(`${this.baseUrl}${id}/update/`);
  }

  readWebhookKey(id: number | string) {
    return this.http.get(`${this.baseUrl}${id}/webhook_key/`);
  }

  sync(id: number | string) {
    return this.http.post(`${this.baseUrl}${id}/update/`);
  }

  updateWebhookKey(id: number | string) {
    return this.http.post(`${this.baseUrl}${id}/webhook_key/`);
  }
}

export default Projects;
