import Base from '../Base';
import RunnableMixin from '../mixins/Runnable.mixin';
import type { Http } from '../Base';
import type { QSParams } from 'util/qs';

class WorkflowJobs extends RunnableMixin(Base) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/workflow_jobs/';
  }

  readNodes(id: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${id}/workflow_nodes/`, { params });
  }

  readCredentials(id: number | string) {
    return this.http.get(`${this.baseUrl}${id}/credentials/`);
  }
}

export default WorkflowJobs;
