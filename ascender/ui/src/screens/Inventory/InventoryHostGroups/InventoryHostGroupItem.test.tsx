import type { Group } from 'types/api';
import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InventoryHostGroupItem from './InventoryHostGroupItem';

describe('<InventoryHostGroupItem />', () => {
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
  } as unknown as Group;

  function renderItem(group: Group) {
    return renderWithContexts(
      <table>
        <tbody>
          <InventoryHostGroupItem
            group={group}
            inventoryId={1}
            isSelected={false}
            onSelect={() => {}}
            rowIndex={0}
          />
        </tbody>
      </table>
    );
  }

  test('initially renders successfully', () => {
    renderItem(mockGroup);
    expect(screen.getByRole('link', { name: 'foo' })).toBeInTheDocument();
  });

  test('edit button should be shown to users with edit capabilities', () => {
    renderItem(mockGroup);
    const editLink = screen
      .getAllByRole('link')
      .find((link) => link.getAttribute('href')?.endsWith('/edit'));
    expect(editLink).toBeDefined();
  });

  test('edit button should be hidden from users without edit capabilities', () => {
    renderItem({
      ...mockGroup,
      summary_fields: { user_capabilities: { edit: false } },
    } as unknown as Group);
    const editLink = screen
      .queryAllByRole('link')
      .find((link) => link.getAttribute('href')?.endsWith('/edit'));
    expect(editLink).toBeUndefined();
  });
  /*
   * A group of a constructed or federated inventory opens under that kind of
   * inventory, where the app looks for it, not under a plain one.
   */
  test.each([
    ['', '/inventories/inventory/7/groups/2/details'],
    ['constructed', '/inventories/constructed_inventory/7/groups/2/details'],
    ['federated', '/inventories/federated_inventory/7/groups/2/details'],
  ])('links a group of a %s inventory by its kind', (kind, href) => {
    renderItem({
      ...mockGroup,
      summary_fields: {
        inventory: { id: 7, name: 'inv', kind },
        user_capabilities: { edit: false },
      },
    } as unknown as Group);
    expect(screen.getByRole('link', { name: 'foo' })).toHaveAttribute(
      'href',
      href
    );
  });

  /*
   * A constructed or federated inventory builds its groups from its sources
   * and the api refuses to edit them, so the row offers no Edit even to
   * someone the group says may edit it.
   */
  test.each(['constructed', 'federated'])(
    'offers no edit for a group of a %s inventory',
    (kind) => {
      renderItem({
        ...mockGroup,
        summary_fields: {
          inventory: { id: 7, name: 'inv', kind },
          user_capabilities: { edit: true },
        },
      } as unknown as Group);
      const editLink = screen
        .queryAllByRole('link')
        .find((link) => link.getAttribute('href')?.endsWith('/edit'));
      expect(editLink).toBeUndefined();
    }
  );
});
