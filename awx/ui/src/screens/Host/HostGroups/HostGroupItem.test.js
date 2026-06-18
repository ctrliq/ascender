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
  };

  function renderItem(group) {
    return renderWithContexts(
      <table>
        <tbody>
          <HostGroupItem
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
    });
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
    });
    expect(
      container.querySelector(
        'a[href="/inventories/inventory/1/groups/2/edit"]'
      )
    ).not.toBeInTheDocument();
  });
});
