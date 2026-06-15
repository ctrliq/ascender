import React from 'react';
import { act } from 'react-dom/test-utils';
import { createMemoryHistory } from 'history';
import { InventoriesAPI, OrganizationsAPI } from 'api';

import { mountWithContexts } from '../../../testUtils/enzymeHelpers';

import Inventories from './Inventories';

jest.mock('../../api');
// stub the list so the /inventories route renders without hitting the API
jest.mock('./InventoryList', () => ({
  __esModule: true,
  InventoryList: () => null,
}));
// stub the detail so this suite asserts route resolution, not detail rendering
jest.mock('./InventoryDetail', () => {
  const InventoryDetail = () => <div>InventoryDetail</div>;
  return { __esModule: true, default: InventoryDetail };
});

describe('<Inventories />', () => {
  test('initially renders without crashing', () => {
    const history = createMemoryHistory({ initialEntries: ['/inventories'] });
    const pageWrapper = mountWithContexts(<Inventories />, {
      context: { router: { history } },
    });
    expect(pageWrapper.length).toBe(1);
  });

  // Guards against the absolute-vs-relative regression: a detail tab URL must
  // resolve to that tab through the dispatcher, not fall through to not-found.
  test('resolves a detail tab through the dispatcher', async () => {
    InventoriesAPI.readDetail.mockResolvedValue({
      data: {
        id: 1,
        name: 'Foo',
        kind: '',
        summary_fields: { user_capabilities: {} },
      },
    });
    OrganizationsAPI.read.mockResolvedValue({
      data: { results: [], count: 0 },
    });
    const history = createMemoryHistory({
      initialEntries: ['/inventories/inventory/1/details'],
    });
    let wrapper;
    await act(async () => {
      wrapper = mountWithContexts(<Inventories />, {
        context: { router: { history } },
      });
    });
    wrapper.update();
    expect(wrapper.find('InventoryDetail').length).toBe(1);
    expect(wrapper.find('ContentError').length).toBe(0);
  });
});
