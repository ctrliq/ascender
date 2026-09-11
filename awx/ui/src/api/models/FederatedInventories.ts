import Base from '../Base';
import type { Http } from '../Base';

class FederatedInventories extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/federated_inventories/';
  }

  async readFederatedInventoryOptions(id: number | string, method: string) {
    const {
      data: { actions },
    } = await this.http.options<{ actions: Record<string, unknown> }>(
      `${this.baseUrl}${id}/`
    );

    if (actions[method]) {
      return actions[method];
    }

    throw new Error(
      'You have insufficient access to this Federated Inventory. Please contact your system administrator if there is an issue with your access.'
    );
  }
}
export default FederatedInventories;
