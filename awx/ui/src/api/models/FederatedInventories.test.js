import FederatedInventories from './FederatedInventories';

describe('FederatedInventoriesAPI', () => {
  const federatedInventoryId = 1;
  const federatedInventoryMethod = 'PUT';
  let FederatedInventoriesAPI;
  let mockHttp;

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
      options: jest.fn(optionsPromise),
    };
    FederatedInventoriesAPI = new FederatedInventories(mockHttp);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('readFederatedInventoryOptions calls OPTIONS on the correct URL', async () => {
    await FederatedInventoriesAPI.readFederatedInventoryOptions(
      federatedInventoryId,
      federatedInventoryMethod
    );
    expect(mockHttp.options).toHaveBeenCalledTimes(1);
    expect(mockHttp.options).toHaveBeenCalledWith(
      `api/v2/federated_inventories/${federatedInventoryId}/`
    );
  });

  test('readFederatedInventoryOptions throws a helpful error when the method is missing from actions', async () => {
    await expect(
      FederatedInventoriesAPI.readFederatedInventoryOptions(
        federatedInventoryId,
        'POST'
      )
    ).rejects.toThrow('You have insufficient access to this Federated Inventory.');
  });
});
