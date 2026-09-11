import Base from '../Base';
import type { Http } from '../Base';
import type { QSParams } from 'util/qs';

class ExecutionEnvironments extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/execution_environments/';
  }

  readUnifiedJobTemplates(id: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${id}/unified_job_templates/`, {
      params,
    });
  }

  readUnifiedJobTemplateOptions(id: number | string) {
    return this.http.options(`${this.baseUrl}${id}/unified_job_templates/`);
  }
}

export default ExecutionEnvironments;
