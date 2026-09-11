import type { BaseConstructor } from '../Base';
import type { QSParams } from 'util/qs';
function isEqual(
  array1: { id: number | string }[],
  array2: { id: number | string }[]
): boolean {
  return (
    array1.length === array2.length &&
    array1.every((element, index) => element.id === array2[index]?.id)
  );
}

const InstanceGroupsMixin = <T extends BaseConstructor>(parent: T) =>
  class extends parent {
    readInstanceGroups(resourceId: number | string, params?: QSParams) {
      return this.http.get(`${this.baseUrl}${resourceId}/instance_groups/`, {
        params,
      });
    }

    associateInstanceGroup(resourceId: number | string, instanceGroupId: number | string) {
      return this.http.post(`${this.baseUrl}${resourceId}/instance_groups/`, {
        id: instanceGroupId,
      });
    }

    disassociateInstanceGroup(resourceId: number | string, instanceGroupId: number | string) {
      return this.http.post(`${this.baseUrl}${resourceId}/instance_groups/`, {
        id: instanceGroupId,
        disassociate: true,
      });
    }

    async orderInstanceGroups(
      resourceId: number | string,
      current: { id: number | string }[],
      original: { id: number | string }[]
    ) {
      /* eslint-disable no-await-in-loop, no-restricted-syntax */
      // Resolve Promises sequentially to maintain order and avoid race condition
      if (!isEqual(current, original)) {
        for (const group of original) {
          await this.disassociateInstanceGroup(resourceId, group.id);
        }
        for (const group of current) {
          await this.associateInstanceGroup(resourceId, group.id);
        }
      }
    }
    /* eslint-enable no-await-in-loop, no-restricted-syntax */
  };

export default InstanceGroupsMixin;
