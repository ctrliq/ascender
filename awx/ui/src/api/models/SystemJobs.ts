import type { QSParams } from 'util/qs';
import type { Credential, Paginated, SystemJob } from '../../types/api';
import Base from '../Base';

import RunnableMixin from '../mixins/Runnable.mixin';
import type { Http } from '../Base';

class SystemJobs extends RunnableMixin(Base) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/system_jobs/';
  }

  // Reached through a mixin, which cannot carry the resource type along, so
  // the calls that answer with a system job say so here.
  read<T = Paginated<SystemJob>>(params?: QSParams) {
    return super.read<T>(params);
  }

  readDetail<T = SystemJob>(id: number | string) {
    return super.readDetail<T>(id);
  }

  create<T = SystemJob>(data?: unknown) {
    return super.create<T>(data);
  }

  update<T = SystemJob>(id: number | string, data?: unknown) {
    return super.update<T>(id, data);
  }

  copy<T = SystemJob>(id: number | string, data?: unknown) {
    return super.copy<T>(id, data);
  }

  readCredentials(id: number | string) {
    return this.http.get<Paginated<Credential>>(
      `${this.baseUrl}${id}/credentials/`
    );
  }
}

export default SystemJobs;
