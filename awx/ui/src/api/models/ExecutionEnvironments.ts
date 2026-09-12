import type { QSParams } from 'util/qs';
import type {
  AnyUnifiedJobTemplate,
  ExecutionEnvironment,
  OptionsResponse,
  Paginated,
} from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class ExecutionEnvironments extends Base<ExecutionEnvironment> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/execution_environments/';
  }

  readUnifiedJobTemplates(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<AnyUnifiedJobTemplate>>(
      `${this.baseUrl}${id}/unified_job_templates/`,
      {
        params,
      }
    );
  }

  readUnifiedJobTemplateOptions(id: number | string) {
    return this.http.options<OptionsResponse>(
      `${this.baseUrl}${id}/unified_job_templates/`
    );
  }
}

export default ExecutionEnvironments;
