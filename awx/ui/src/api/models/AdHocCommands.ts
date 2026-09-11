import type { QSParams } from 'util/qs';
import type { AdHocCommand, Credential, Paginated } from '../../types/api';
import Base from '../Base';
import RunnableMixin from '../mixins/Runnable.mixin';
import type { Http } from '../Base';

class AdHocCommands extends RunnableMixin(Base) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/ad_hoc_commands/';
  }

  // Reached through a mixin, which cannot carry the resource type along, so
  // the calls that answer with an ad hoc command say so here.
  read<T = Paginated<AdHocCommand>>(params?: QSParams) {
    return super.read<T>(params);
  }

  readDetail<T = AdHocCommand>(id: number | string) {
    return super.readDetail<T>(id);
  }

  create<T = AdHocCommand>(data?: unknown) {
    return super.create<T>(data);
  }

  update<T = AdHocCommand>(id: number | string, data?: unknown) {
    return super.update<T>(id, data);
  }

  copy<T = AdHocCommand>(id: number | string, data?: unknown) {
    return super.copy<T>(id, data);
  }

  readCredentials(id: number | string) {
    return this.http.get<Paginated<Credential>>(
      `${this.baseUrl}${id}/credentials/`
    );
  }
}

export default AdHocCommands;
