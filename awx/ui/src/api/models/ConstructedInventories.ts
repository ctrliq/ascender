import type { QSParams } from 'util/qs';
import type {
  ConstructedInventory,
  OptionsField,
  Paginated,
} from '../../types/api';
import Base from '../Base';
import InstanceGroupsMixin from '../mixins/InstanceGroups.mixin';
import type { Http } from '../Base';

class ConstructedInventories extends InstanceGroupsMixin(Base) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/constructed_inventories/';
  }

  // Reached through a mixin, which cannot carry the resource type along, so
  // the calls that answer with a constructed inventory say so here.
  read<T = Paginated<ConstructedInventory>>(params?: QSParams) {
    return super.read<T>(params);
  }

  readDetail<T = ConstructedInventory>(id: number | string) {
    return super.readDetail<T>(id);
  }

  create<T = ConstructedInventory>(data?: unknown) {
    return super.create<T>(data);
  }

  update<T = ConstructedInventory>(id: number | string, data?: unknown) {
    return super.update<T>(id, data);
  }

  copy<T = ConstructedInventory>(id: number | string, data?: unknown) {
    return super.copy<T>(id, data);
  }

  async readConstructedInventoryOptions(id: number | string, method: string) {
    const {
      data: { actions },
    } = await this.http.options<{
      actions: Record<string, Record<string, OptionsField>>;
    }>(`${this.baseUrl}${id}/`);

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
