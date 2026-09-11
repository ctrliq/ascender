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

  launch(id: number | string, data: unknown) {
    return this.http.post(`${this.baseUrl}${id}/launch/`, data);
  }
}

export default SystemJobTemplates;
