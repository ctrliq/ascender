import type { Group } from 'types/api';
import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import HostGroupItem from './HostGroupItem';

describe('<HostGroupItem />', () => {
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
          <HostGroupItem
            rowIndex={0}
            group={group}
            inventoryId={1}
            isSelected={false}
            onSelect={() => {}}
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
    const { container } = renderItem({
      ...mockGroup,
      summary_fields: { user_capabilities: { edit: true } },
    } as unknown as Group);
    expect(
      container.querySelector(
        'a[href="/inventories/inventory/1/groups/2/edit"]'
      )
    ).toBeInTheDocument();
  });

  test('edit button should be hidden from users without edit capabilities', () => {
    const { container } = renderItem({
      ...mockGroup,
      summary_fields: { user_capabilities: { edit: false } },
    } as unknown as Group);
    expect(
      container.querySelector(
        'a[href="/inventories/inventory/1/groups/2/edit"]'
      )
    ).not.toBeInTheDocument();
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

  // The api refuses to edit a group a constructed or federated inventory
  // builds from its sources, so the row offers no Edit even to an admin.
  test.each(['constructed', 'federated'])(
    'offers no Edit on a group of a %s inventory',
    (kind) => {
      renderItem({
        ...mockGroup,
        summary_fields: {
          inventory: { id: 7, name: 'inv', kind },
          user_capabilities: { edit: true },
        },
      } as unknown as Group);
      expect(
        screen.queryByRole('link', { name: 'Edit Group' })
      ).not.toBeInTheDocument();
    }
  );
});
