import React from 'react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryGroupItem from './InventoryGroupItem';

const mockGroup = {
  id: 2,
  type: 'group',
  name: 'foo',
  inventory: 1,
  summary_fields: {
    user_capabilities: {
      edit: true,
    },
  },
};

function renderItem(group, url = '/inventories/inventory/1/groups') {
  const history = createMemoryHistory({ initialEntries: [url] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/inventories/:inventoryType/:id/groups/*"
        element={
          <table>
            <tbody>
              <InventoryGroupItem
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

describe('<InventoryGroupItem />', () => {
  test('initially renders successfully', () => {
    renderItem(mockGroup);
    expect(screen.getByRole('link', { name: 'foo' })).toBeInTheDocument();
  });

  test('edit button should be shown to users with edit capabilities', () => {
    renderItem(mockGroup);
    expect(
      screen.getByRole('link', { name: 'Edit Group' })
    ).toBeInTheDocument();
  });

  test('edit button should be hidden from users without edit capabilities', () => {
    renderItem({
      ...mockGroup,
      summary_fields: { user_capabilities: { edit: false } },
    });
    expect(
      screen.queryByRole('link', { name: 'Edit Group' })
    ).not.toBeInTheDocument();
  });

  test('edit button should be hidden from constructed inventory group', () => {
    renderItem(mockGroup, '/inventories/constructed_inventory/42/groups');
    expect(
      screen.queryByRole('link', { name: 'Edit Group' })
    ).not.toBeInTheDocument();
  });
});
