import React from 'react';
import { createMemoryHistory } from 'history';

import { mountWithContexts } from '../../../testUtils/enzymeHelpers';

import Inventories from './Inventories';

// stub the list so the /inventories route renders without hitting the API
jest.mock('./InventoryList', () => ({
  __esModule: true,
  InventoryList: () => null,
}));

describe('<Inventories />', () => {
  let pageWrapper;

  beforeEach(() => {
    const history = createMemoryHistory({ initialEntries: ['/inventories'] });
    pageWrapper = mountWithContexts(<Inventories />, {
      context: { router: { history } },
    });
  });

  test('initially renders without crashing', () => {
    expect(pageWrapper.length).toBe(1);
  });
});
