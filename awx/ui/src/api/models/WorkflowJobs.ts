import type { QSParams } from 'util/qs';
import type {
  Credential,
  Paginated,
  WorkflowJob,
  WorkflowJobTemplateNode,
} from '../../types/api';
import Base from '../Base';
import RunnableMixin from '../mixins/Runnable.mixin';
import type { Http } from '../Base';

class WorkflowJobs extends RunnableMixin(Base) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/workflow_jobs/';
  }

  // Reached through a mixin, which cannot carry the resource type along, so
  // the calls that answer with a workflow job say so here.
  read<T = Paginated<WorkflowJob>>(params?: QSParams) {
    return super.read<T>(params);
  }

  readDetail<T = WorkflowJob>(id: number | string) {
    return super.readDetail<T>(id);
  }

  create<T = WorkflowJob>(data?: unknown) {
    return super.create<T>(data);
  }

  update<T = WorkflowJob>(id: number | string, data?: unknown) {
    return super.update<T>(id, data);
  }

  copy<T = WorkflowJob>(id: number | string, data?: unknown) {
    return super.copy<T>(id, data);
  }

  readNodes(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<WorkflowJobTemplateNode>>(
      `${this.baseUrl}${id}/workflow_nodes/`,
      { params }
    );
  }

  readCredentials(id: number | string) {
    return this.http.get<Paginated<Credential>>(
      `${this.baseUrl}${id}/credentials/`
    );
  }
}

export default WorkflowJobs;
