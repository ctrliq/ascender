import React from 'react';
import { act } from 'react-dom/test-utils';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router-dom-v5-compat';
import { InventoriesAPI } from 'api';
import { mountWithContexts } from '../../../../testUtils/enzymeHelpers';

import InventoryGroupsDeleteModal from './InventoryGroupsDeleteModal';

jest.mock('../../../api');
describe('<InventoryGroupsDeleteModal />', () => {
  let wrapper;
  beforeEach(() => {
    const history = createMemoryHistory({
      initialEntries: ['/inventories/inventory/1/groups'],
    });
    act(() => {
      wrapper = mountWithContexts(
        <Routes>
          <Route
            path="/inventories/:inventoryType/:id/groups/*"
            element={
              <InventoryGroupsDeleteModal
                onAfterDelete={() => {}}
                isDisabled={false}
                groups={[
                  { id: 1, name: 'Foo' },
                  { id: 2, name: 'Bar' },
                ]}
              />
            }
          />
        </Routes>,
        { context: { router: { history } } }
      );
    });
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  test('should mount properly', async () => {
    expect(wrapper.find('Button[aria-label="Delete"]').length).toBe(1);
    act(() => wrapper.find('Button[aria-label="Delete"]').prop('onClick')());
    wrapper.update();
    expect(wrapper.find('AlertModal').length).toBe(1);
  });

  test('should close modal', () => {
    act(() => wrapper.find('Button[aria-label="Delete"]').prop('onClick')());
    wrapper.update();
    act(() => wrapper.find('ModalBoxCloseButton').prop('onClose')());
    wrapper.update();
    expect(wrapper.find('AlertModal').length).toBe(0);
  });

  test('should delete properly', async () => {
    act(() => wrapper.find('Button[aria-label="Delete"]').prop('onClick')({}));
    wrapper.update();
    act(() =>
      wrapper
        .find('Radio[label="Promote Child Groups and Hosts"]')
        .invoke('onChange')()
    );
    wrapper.update();
    expect(
      wrapper.find('Button[aria-label="Confirm Delete"]').prop('isDisabled')
    ).toBe(false);
    await act(() =>
      wrapper.find('Button[aria-label="Confirm Delete"]').prop('onClick')()
    );
    expect(InventoriesAPI.promoteGroup).toHaveBeenCalledWith('1', 1);
  });

  test('should throw deletion error ', async () => {
    InventoriesAPI.promoteGroup.mockRejectedValue(
      new Error({
        response: {
          config: {
            method: 'post',
            url: '/api/v2/inventories/1/groups',
          },
          data: 'An error occurred',
          status: 403,
        },
      })
    );
    act(() => wrapper.find('Button[aria-label="Delete"]').prop('onClick')({}));
    wrapper.update();
    act(() =>
      wrapper
        .find('Radio[label="Promote Child Groups and Hosts"]')
        .invoke('onChange')()
    );
    wrapper.update();
    expect(
      wrapper.find('Button[aria-label="Confirm Delete"]').prop('isDisabled')
    ).toBe(false);
    await act(() =>
      wrapper.find('Button[aria-label="Confirm Delete"]').prop('onClick')()
    );
    expect(InventoriesAPI.promoteGroup).toHaveBeenCalledWith('1', 1);
    wrapper.update();
    expect(wrapper.find('ErrorDetail').length).toBe(1);
  });
});
