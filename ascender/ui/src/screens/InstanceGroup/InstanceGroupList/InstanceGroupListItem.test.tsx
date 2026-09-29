import type { InstanceGroup } from 'types/api';
import React from 'react';
import { screen, within } from '@testing-library/react';

import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import InstanceGroupListItem from './InstanceGroupListItem';

const instanceGroups = [
  {
    id: 1,
    name: 'Foo',
    type: 'instance_group',
    url: '/api/v2/instance_groups/1',
    capacity: 10,
    policy_instance_minimum: 10,
    policy_instance_percentage: 50,
    percent_capacity_remaining: 60,
    is_container_group: false,
    summary_fields: {
      user_capabilities: {
        edit: true,
        delete: true,
      },
    },
  },
  {
    id: 2,
    name: 'Bar',
    type: 'instance_group',
    url: '/api/v2/instance_groups/2',
    capacity: 0,
    policy_instance_minimum: 0,
    policy_instance_percentage: 0,
    percent_capacity_remaining: 0,
    is_container_group: true,
    summary_fields: {
      user_capabilities: {
        edit: false,
        delete: false,
      },
    },
  },
] as unknown as InstanceGroup[];

function renderItem(instanceGroup: InstanceGroup, props = {}) {
  return renderWithContexts(
    <table>
      <tbody>
        <InstanceGroupListItem
          rowIndex={0}
          instanceGroup={instanceGroup}
          detailUrl={`instance_groups/${instanceGroup.id}/details`}
          isSelected={false}
          onSelect={() => {}}
          {...props}
        />
      </tbody>
    </table>
  );
}

describe('<InstanceGroupListItem/>', () => {
  test('should render the proper data for an instance group', () => {
    renderItem(instanceGroups[0] as InstanceGroup);
    const row = screen.getByRole('link', { name: 'Foo' }).closest('tr');
    // No type column: the tab the list sits on says which kind these are.
    expect(
      within(row!)
        .getAllByRole('cell')
        .some((cell) => cell.getAttribute('data-label') === 'Type')
    ).toBe(false);
    // Used capacity is rendered as a Progress bar (100 - 60 = 40).
    expect(within(row!).getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '40'
    );
    // edit capability is true -> the edit button is present.
    expect(
      within(row!).getByRole('link', { name: 'Edit Instance Group' })
    ).toBeInTheDocument();
  });

  test('should render the proper data for a container group', () => {
    renderItem(instanceGroups[1] as InstanceGroup);
    const row = screen.getByRole('link', { name: 'Bar' }).closest('tr');
    // edit capability is false -> no edit button.
    expect(
      within(row!).queryByRole('link', { name: 'Edit Container Group' })
    ).not.toBeInTheDocument();
  });

  test('names the edit button after a container group', () => {
    renderItem({
      ...instanceGroups[1],
      summary_fields: { user_capabilities: { edit: true, delete: true } },
    } as unknown as InstanceGroup);
    expect(
      screen.getByRole('link', { name: 'Edit Container Group' })
    ).toHaveAttribute('href', '/container_groups/2/edit');
  });

  test('edit button shown to users with edit capabilities', () => {
    renderItem(instanceGroups[0] as InstanceGroup, { isSelected: true });
    expect(
      screen.getByRole('link', { name: 'Edit Instance Group' })
    ).toBeInTheDocument();
  });

  test('edit button hidden from users without edit capabilities', () => {
    renderItem(instanceGroups[1] as InstanceGroup, { isSelected: true });
    expect(
      screen.queryByRole('link', { name: 'Edit Container Group' })
    ).not.toBeInTheDocument();
  });
});
