import Base from '../Base';
import RunnableMixin from '../mixins/Runnable.mixin';
import type { Http } from '../Base';

class Jobs extends RunnableMixin(Base) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/jobs/';
    this.jobEventSlug = '/job_events/';
  }

  cancel(id: number | string) {
    return this.http.post(`${this.baseUrl}${id}/cancel/`);
  }

  readCredentials(id: number | string) {
    return this.http.get(`${this.baseUrl}${id}/credentials/`);
  }

  readDetail<T = unknown>(id: number | string) {
    return this.http.get<T>(`${this.baseUrl}${id}/`);
  }

  readChildrenSummary(id: number | string) {
    return this.http.get(`${this.baseUrl}${id}/job_events/children_summary/`);
  }
}

export default Jobs;
