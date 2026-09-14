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
});
