import Base from '../Base';

import RunnableMixin from '../mixins/Runnable.mixin';
import type { Http } from '../Base';

class SystemJobs extends RunnableMixin(Base) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/system_jobs/';
  }

  readCredentials(id: number | string) {
    return this.http.get(`${this.baseUrl}${id}/credentials/`);
  }
}

export default SystemJobs;
