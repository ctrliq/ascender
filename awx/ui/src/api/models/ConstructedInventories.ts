import Base from '../Base';
import InstanceGroupsMixin from '../mixins/InstanceGroups.mixin';
import type { Http } from '../Base';

class ConstructedInventories extends InstanceGroupsMixin(Base) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/constructed_inventories/';
  }

  async readConstructedInventoryOptions(id: number | string, method: string) {
    const {
      data: { actions },
    } = await this.http.options<{ actions: Record<string, unknown> }>(`${this.baseUrl}${id}/`);

    if (actions[method]) {
      return actions[method];
    }

    throw new Error(
      `You have insufficient access to this Constructed Inventory. 
      Please contact your system administrator if there is an issue with your access.`
    );
  }
}
export default ConstructedInventories;
