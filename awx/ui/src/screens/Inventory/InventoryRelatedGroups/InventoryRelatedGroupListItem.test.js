import React from 'react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router-dom-v5-compat';
import { mountWithContexts } from '../../../../testUtils/enzymeHelpers';
import InventoryRelatedGroupListItem from './InventoryRelatedGroupListItem';
import mockRelatedGroups from '../shared/data.relatedGroups.json';

jest.mock('../../../api');

const mockGroup = mockRelatedGroups.results[0];
describe('<InventoryRelatedGroupListItem />', () => {
  let wrapper;
  const history = createMemoryHistory({
    initialEntries: ['/inventories/inventory/1/groups/2/nested_groups'],
  });
  beforeEach(() => {
    wrapper = mountWithContexts(
      <Routes>
        <Route
          path="/inventories/:inventoryType/:id/groups/:groupId/nested_groups/*"
          element={
            <table>
              <tbody>
                <InventoryRelatedGroupListItem
                  detailUrl="/group/1"
                  editUrl="/group/1"
                  group={mockGroup}
                  isSelected={false}
                  onSelect={() => {}}
                  rowIndex={0}
                />
              </tbody>
            </table>
          }
        />
      </Routes>,
      { context: { router: { history } } }
    );
  });

  test('should display expected row item content', () => {
    expect(wrapper.find('b').text()).toContain('Group 2 Inventory 0');
  });

  test('edit button shown to users with edit capabilities', () => {
    expect(wrapper.find('PencilAltIcon').exists()).toBeTruthy();
  });

  test('edit button hidden from users without edit capabilities', () => {
    wrapper = mountWithContexts(
      <Routes>
        <Route
          path="/inventories/:inventoryType/:id/groups/:groupId/nested_groups/*"
          element={
            <table>
              <tbody>
                <InventoryRelatedGroupListItem
                  detailUrl="/group/1"
                  editUrl="/group/1"
                  group={mockRelatedGroups.results[2]}
                  isSelected={false}
                  onSelect={() => {}}
                  rowIndex={0}
                />
              </tbody>
            </table>
          }
        />
      </Routes>,
      { context: { router: { history } } }
    );
    expect(wrapper.find('PencilAltIcon').exists()).toBeFalsy();
  });
});

describe('<InventoryRelatedGroupList> for constructed inventories', () => {
  let wrapper;

  test('edit button hidden from users without edit capabilities', () => {
    const history = createMemoryHistory({
      initialEntries: [
        '/inventories/constructed_inventory/1/groups/2/nested_groups',
      ],
    });
    wrapper = mountWithContexts(
      <Routes>
        <Route
          path="/inventories/:inventoryType/:id/groups/:groupId/nested_groups/*"
          element={
            <table>
              <tbody>
                <InventoryRelatedGroupListItem
                  detailUrl="/group/1"
                  editUrl="/group/1"
                  group={mockGroup}
                  isSelected={false}
                  onSelect={() => {}}
                  rowIndex={0}
                />
              </tbody>
            </table>
          }
        />
      </Routes>,
      { context: { router: { history } } }
    );
    expect(wrapper.find('PencilAltIcon').exists()).toBeFalsy();
  });
});
