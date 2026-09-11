import Base from '../Base';
import RunnableMixin from '../mixins/Runnable.mixin';
import type { Http } from '../Base';

class InventoryUpdates extends RunnableMixin(Base) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/inventory_updates/';
    this.createSyncCancel = this.createSyncCancel.bind(this);
  }

  createSyncCancel(sourceId: number | string) {
    return this.http.post(`${this.baseUrl}${sourceId}/cancel/`);
  }

  readCredentials(id: number | string) {
    return this.http.get(`${this.baseUrl}${id}/credentials/`);
  }
}
export default InventoryUpdates;
