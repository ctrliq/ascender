import type { QSParams } from 'util/qs';
import type { Credential, InventoryUpdate, Paginated } from '../../types/api';
import Base from '../Base';
import RunnableMixin from '../mixins/Runnable.mixin';
import type { Http } from '../Base';

class InventoryUpdates extends RunnableMixin(Base) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/inventory_updates/';
    this.createSyncCancel = this.createSyncCancel.bind(this);
  }

  // Reached through a mixin, which cannot carry the resource type along, so
  // the calls that answer with an inventory update say so here.
  read<T = Paginated<InventoryUpdate>>(params?: QSParams) {
    return super.read<T>(params);
  }

  readDetail<T = InventoryUpdate>(id: number | string) {
    return super.readDetail<T>(id);
  }

  create<T = InventoryUpdate>(data?: unknown) {
    return super.create<T>(data);
  }

  update<T = InventoryUpdate>(id: number | string, data?: unknown) {
    return super.update<T>(id, data);
  }

  copy<T = InventoryUpdate>(id: number | string, data?: unknown) {
    return super.copy<T>(id, data);
  }

  createSyncCancel(sourceId: number | string) {
    return this.http.post(`${this.baseUrl}${sourceId}/cancel/`);
  }

  readCredentials(id: number | string) {
    return this.http.get<Paginated<Credential>>(
      `${this.baseUrl}${id}/credentials/`
    );
  }
}
export default InventoryUpdates;
