import Base from '../Base';
import type { Http } from '../Base';

class InventoryScripts extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/inventory_scripts/';
  }
}

export default InventoryScripts;
