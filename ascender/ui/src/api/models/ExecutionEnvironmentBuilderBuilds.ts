import type { QSParams } from 'util/qs';
import type {
  Credential,
  ExecutionEnvironmentBuilderBuild,
  Paginated,
} from '../../types/api';
import Base from '../Base';
import RunnableMixin from '../mixins/Runnable.mixin';
import type { Http } from '../Base';

class ExecutionEnvironmentBuilderBuilds extends RunnableMixin(Base) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/builds/';
  }

  // Reached through a mixin, which cannot carry the resource type along, so
  // the calls that answer with a build say so here.
  read<T = Paginated<ExecutionEnvironmentBuilderBuild>>(params?: QSParams) {
    return super.read<T>(params);
  }

  readDetail<T = ExecutionEnvironmentBuilderBuild>(id: number | string) {
    return super.readDetail<T>(id);
  }

  create<T = ExecutionEnvironmentBuilderBuild>(data?: unknown) {
    return super.create<T>(data);
  }

  update<T = ExecutionEnvironmentBuilderBuild>(
    id: number | string,
    data?: unknown
  ) {
    return super.update<T>(id, data);
  }

  copy<T = ExecutionEnvironmentBuilderBuild>(
    id: number | string,
    data?: unknown
  ) {
    return super.copy<T>(id, data);
  }

  readCredentials(id: number | string) {
    return this.http.get<Paginated<Credential>>(
      `${this.baseUrl}${id}/credentials/`
    );
  }
}

export default ExecutionEnvironmentBuilderBuilds;
