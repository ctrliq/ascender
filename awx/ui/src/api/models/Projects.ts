import type { QSParams } from 'util/qs';
import type {
  AccessListEntry,
  OptionsResponse,
  Paginated,
  Project,
  ProjectUpdate,
  WebhookKey,
} from '../../types/api';
import Base from '../Base';
import NotificationsMixin from '../mixins/Notifications.mixin';
import LaunchUpdateMixin from '../mixins/LaunchUpdate.mixin';
import SchedulesMixin from '../mixins/Schedules.mixin';
import type { Http } from '../Base';

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

  // Reached through a mixin, which cannot carry the resource type along, so
  // the calls that answer with a project say so here.
  read<T = Paginated<Project>>(params?: QSParams) {
    return super.read<T>(params);
  }

  readDetail<T = Project>(id: number | string) {
    return super.readDetail<T>(id);
  }

  create<T = Project>(data?: unknown) {
    return super.create<T>(data);
  }

  update<T = Project>(id: number | string, data?: unknown) {
    return super.update<T>(id, data);
  }

  copy<T = Project>(id: number | string, data?: unknown) {
    return super.copy<T>(id, data);
  }

  readAccessList(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<AccessListEntry>>(
      `${this.baseUrl}${id}/access_list/`,
      { params }
    );
  }

  readAccessOptions(id: number | string) {
    return this.http.options<OptionsResponse>(
      `${this.baseUrl}${id}/access_list/`
    );
  }

  // The paths of the inventory files the project holds, not inventories.
  readInventories(id: number | string) {
    return this.http.get<string[]>(`${this.baseUrl}${id}/inventories/`);
  }

  // The paths of the playbooks the project holds.
  readPlaybooks(id: number | string) {
    return this.http.get<string[]>(`${this.baseUrl}${id}/playbooks/`);
  }

  readSync(id: number | string) {
    return this.http.get<{ can_update: boolean }>(
      `${this.baseUrl}${id}/update/`
    );
  }

  readWebhookKey(id: number | string) {
    return this.http.get<WebhookKey>(`${this.baseUrl}${id}/webhook_key/`);
  }

  sync(id: number | string) {
    return this.http.post<ProjectUpdate>(`${this.baseUrl}${id}/update/`);
  }

  updateWebhookKey(id: number | string) {
    return this.http.post<WebhookKey>(`${this.baseUrl}${id}/webhook_key/`);
  }
}

export default Projects;
