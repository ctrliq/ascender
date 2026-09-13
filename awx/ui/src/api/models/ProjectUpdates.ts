import type { QSParams } from 'util/qs';
import type { Credential, Paginated, ProjectUpdate } from '../../types/api';
import Base from '../Base';
import RunnableMixin from '../mixins/Runnable.mixin';
import type { Http } from '../Base';

class ProjectUpdates extends RunnableMixin(Base) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/project_updates/';
  }

  // Reached through a mixin, which cannot carry the resource type along, so
  // the calls that answer with a project update say so here.
  read<T = Paginated<ProjectUpdate>>(params?: QSParams) {
    return super.read<T>(params);
  }

  readDetail<T = ProjectUpdate>(id: number | string) {
    return super.readDetail<T>(id);
  }

  create<T = ProjectUpdate>(data?: unknown) {
    return super.create<T>(data);
  }

  update<T = ProjectUpdate>(id: number | string, data?: unknown) {
    return super.update<T>(id, data);
  }

  copy<T = ProjectUpdate>(id: number | string, data?: unknown) {
    return super.copy<T>(id, data);
  }

  readCredentials(id: number | string) {
    return this.http.get<Paginated<Credential>>(
      `${this.baseUrl}${id}/credentials/`
    );
  }
}

export default ProjectUpdates;
