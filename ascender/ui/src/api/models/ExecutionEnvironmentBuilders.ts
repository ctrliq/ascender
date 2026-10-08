import type { QSParams } from 'util/qs';
import type {
  AccessListEntry,
  ExecutionEnvironmentBuilder,
  ExecutionEnvironmentBuilderBuild,
  OptionsResponse,
  Paginated,
  UnifiedJob,
} from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class ExecutionEnvironmentBuilders extends Base<ExecutionEnvironmentBuilder> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/execution_environment_builders/';

    this.readAccessList = this.readAccessList.bind(this);
    this.readAccessOptions = this.readAccessOptions.bind(this);
    this.launch = this.launch.bind(this);
    this.readBuilds = this.readBuilds.bind(this);
  }

  readAccessList(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<AccessListEntry>>(
      `${this.baseUrl}${id}/access_list/`,
      {
        params,
      }
    );
  }

  readAccessOptions(id: number | string) {
    return this.http.options<OptionsResponse>(
      `${this.baseUrl}${id}/access_list/`
    );
  }

  /** Starts a build, which answers with the build it queued. */
  launch(id: number | string) {
    return this.http.post<ExecutionEnvironmentBuilderBuild>(
      `${this.baseUrl}${id}/launch/`
    );
  }

  readBuilds(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<UnifiedJob>>(
      `${this.baseUrl}${id}/builds/`,
      {
        params,
      }
    );
  }
}

export default ExecutionEnvironmentBuilders;
