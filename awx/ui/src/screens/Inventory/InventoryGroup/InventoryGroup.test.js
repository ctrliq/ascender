import React from 'react';
import { Routes, Route } from 'react-router-dom-v5-compat';
import { act } from 'react-dom/test-utils';
import { createMemoryHistory } from 'history';
import { GroupsAPI } from 'api';
import {
  mountWithContexts,
  waitForElement,
} from '../../../../testUtils/enzymeHelpers';

import InventoryGroup from './InventoryGroup';

jest.mock('../../../api');

const groupData = {
  data: {
    id: 1,
    name: 'Foo',
    description: 'Bar',
    variables: 'bizz: buzz',
    summary_fields: {
      inventory: { id: 1 },
      created_by: { id: 1, username: 'Athena' },
      modified_by: { id: 1, username: 'Apollo' },
    },
    created: '2020-04-25T01:23:45.678901Z',
    modified: '2020-04-25T01:23:45.678901Z',
  },
};

const inventory = { id: 1, name: 'Foo' };

// Mount under the same /inventories/:inventoryType/:id/groups/:groupId/* route
// that InventoryGroups gives it, so useParams resolves from the URL.
function renderAt(path) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return mountWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/groups/:groupId/*"
        element={
          <InventoryGroup setBreadcrumb={() => {}} inventory={inventory} />
        }
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<InventoryGroup />', () => {
  let wrapper;

  beforeEach(async () => {
    GroupsAPI.readDetail.mockResolvedValue(groupData);
    await act(async () => {
      wrapper = renderAt('/inventories/inventory/1/groups/1/details');
    });
    await waitForElement(wrapper, 'ContentLoading', (el) => el.length === 0);
  });

  test('renders successfully', async () => {
    expect(wrapper.length).toBe(1);
  });

  test('expect all tabs to exist, including Back to Groups', async () => {
    const routedTabs = wrapper.find('RoutedTabs');
    expect(routedTabs).toHaveLength(1);

    const tabs = routedTabs.prop('tabsArray');
    expect(tabs[0].link).toEqual(`/inventories/inventory/1/groups`);
    expect(tabs[1].name).toEqual('Details');
    expect(tabs[2].name).toEqual('Related Groups');
    expect(tabs[3].name).toEqual('Hosts');
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    await act(async () => {
      wrapper = renderAt('/inventories/inventory/1/groups/1/foobar');
    });
    await waitForElement(wrapper, 'ContentError', (el) => el.length === 1);
  });

  test('should show content error when api throws error on initial render', async () => {
    GroupsAPI.readDetail.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    await act(async () => {
      wrapper = renderAt('/inventories/inventory/1/groups/1/details');
    });
    await waitForElement(wrapper, 'ContentError', (el) => el.length === 1);
  });
});

describe('constructed inventory', () => {
  let wrapper;

  beforeEach(async () => {
    GroupsAPI.readDetail.mockResolvedValue(groupData);
    await act(async () => {
      wrapper = renderAt(
        '/inventories/constructed_inventory/1/groups/1/details'
      );
    });
    await waitForElement(wrapper, 'ContentLoading', (el) => el.length === 0);
  });

  test('Constructed Inventory expect all tabs to exist, including Back to Groups', () => {
    const routedTabs = wrapper.find('RoutedTabs');
    expect(routedTabs).toHaveLength(1);

    const tabs = routedTabs.prop('tabsArray');
    expect(tabs[0].link).toEqual(`/inventories/constructed_inventory/1/groups`);
    expect(tabs[1].name).toEqual('Details');
    expect(tabs[2].name).toEqual('Related Groups');
    expect(tabs[3].name).toEqual('Hosts');
  });
});
