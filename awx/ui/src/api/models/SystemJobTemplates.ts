import type { QSParams } from 'util/qs';
import type { Paginated, SystemJob, SystemJobTemplate } from '../../types/api';
import Base from '../Base';
import NotificationsMixin from '../mixins/Notifications.mixin';
import SchedulesMixin from '../mixins/Schedules.mixin';
import type { Http } from '../Base';

const Mixins = SchedulesMixin(NotificationsMixin(Base));

class SystemJobTemplates extends Mixins {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/system_job_templates/';
  }

  // Reached through a mixin, which cannot carry the resource type along, so
  // the calls that answer with a system job template say so here.
  read<T = Paginated<SystemJobTemplate>>(params?: QSParams) {
    return super.read<T>(params);
  }

  readDetail<T = SystemJobTemplate>(id: number | string) {
    return super.readDetail<T>(id);
  }

  create<T = SystemJobTemplate>(data?: unknown) {
    return super.create<T>(data);
  }

  update<T = SystemJobTemplate>(id: number | string, data?: unknown) {
    return super.update<T>(id, data);
  }

  copy<T = SystemJobTemplate>(id: number | string, data?: unknown) {
    return super.copy<T>(id, data);
  }

  launch(id: number | string, data: unknown) {
    return this.http.post<SystemJob>(`${this.baseUrl}${id}/launch/`, data);
  }
}

export default SystemJobTemplates;
