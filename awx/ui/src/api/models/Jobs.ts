import type { QSParams } from 'util/qs';
import type {
  ChildrenSummary,
  Credential,
  Job,
  Paginated,
} from '../../types/api';
import Base from '../Base';
import RunnableMixin from '../mixins/Runnable.mixin';
import type { Http } from '../Base';

class Jobs extends RunnableMixin(Base) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/jobs/';
    this.jobEventSlug = '/job_events/';
  }

  // Reached through a mixin, which cannot carry the resource type along, so
  // the calls that answer with a job say so here.
  read<T = Paginated<Job>>(params?: QSParams) {
    return super.read<T>(params);
  }

  readDetail<T = Job>(id: number | string) {
    return super.readDetail<T>(id);
  }

  create<T = Job>(data?: unknown) {
    return super.create<T>(data);
  }

  update<T = Job>(id: number | string, data?: unknown) {
    return super.update<T>(id, data);
  }

  copy<T = Job>(id: number | string, data?: unknown) {
    return super.copy<T>(id, data);
  }

  cancel(id: number | string) {
    return this.http.post<void>(`${this.baseUrl}${id}/cancel/`);
  }

  readCredentials(id: number | string) {
    return this.http.get<Paginated<Credential>>(
      `${this.baseUrl}${id}/credentials/`
    );
  }

  readChildrenSummary(id: number | string) {
    return this.http.get<ChildrenSummary>(
      `${this.baseUrl}${id}/job_events/children_summary/`
    );
  }
}

export default Jobs;
