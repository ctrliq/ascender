import type { Mock } from 'vitest';
import type { Http } from '../Base';
import ConstructedInventories from './ConstructedInventories';

describe('ConstructedInventoriesAPI', () => {
  const constructedInventoryId = 1;
  const constructedInventoryMethod = 'PUT';
  let ConstructedInventoriesAPI: ConstructedInventories;
  // Only the methods this model calls, each a vi.fn so its calls can be read.
  let mockHttp: Partial<Record<keyof Http, Mock>>;

  beforeEach(() => {
    const optionsPromise = () =>
      Promise.resolve({
        data: {
          actions: {
            PUT: {},
          },
        },
      });
    mockHttp = {
      options: vi.fn(optionsPromise),
    };
    ConstructedInventoriesAPI = new ConstructedInventories(
      mockHttp as unknown as Http
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  test('readConstructedInventoryOptions calls options with the expected params', async () => {
    await ConstructedInventoriesAPI.readConstructedInventoryOptions(
      constructedInventoryId,
      constructedInventoryMethod
    );
    expect(mockHttp.options).toHaveBeenCalledTimes(1);
    expect(mockHttp.options).toHaveBeenCalledWith(
      `api/v2/constructed_inventories/${constructedInventoryId}/`
    );
  });

  test('readConstructedInventory should throw an error if action method is missing', async () => {
    try {
      await ConstructedInventoriesAPI.readConstructedInventoryOptions(
        constructedInventoryId,
        'POST'
      );
    } catch (error) {
      expect((error as Error).message).toContain(
        'You have insufficient access to this Constructed Inventory.'
      );
    }
  });
});
