import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryRelatedGroupListItem from './InventoryRelatedGroupListItem';
import mockRelatedGroups from '../shared/data.relatedGroups.json';

jest.mock('../../../api');

const mockGroup = mockRelatedGroups.results[0];

// The item reads :inventoryType via useParams; mount under a real v6 route.
function renderItem(url, group = mockGroup) {
  const history = createMemoryHistory({ initialEntries: [url] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/groups/:groupId/nested_groups/*"
        element={
          <table>
            <tbody>
              <InventoryRelatedGroupListItem
                detailUrl="/group/1"
                editUrl="/group/1"
                group={group}
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
}

describe('<InventoryRelatedGroupListItem />', () => {
  const url = '/inventories/inventory/1/groups/2/nested_groups';

  test('should display expected row item content', () => {
    renderItem(url);
    expect(
      screen.getByRole('link', { name: mockGroup.name.trim() })
    ).toBeInTheDocument();
  });

  test('edit button shown to users with edit capabilities', () => {
    renderItem(url);
    expect(
      screen.getByRole('link', { name: 'Edit Group' })
    ).toBeInTheDocument();
  });

  test('edit button hidden from users without edit capabilities', () => {
    renderItem(url, mockRelatedGroups.results[2]);
    expect(
      screen.queryByRole('link', { name: 'Edit Group' })
    ).not.toBeInTheDocument();
  });
});

describe('<InventoryRelatedGroupListItem> for constructed inventories', () => {
  test('edit button hidden for constructed inventory', () => {
    renderItem('/inventories/constructed_inventory/1/groups/2/nested_groups');
    expect(
      screen.queryByRole('link', { name: 'Edit Group' })
    ).not.toBeInTheDocument();
  });
});
