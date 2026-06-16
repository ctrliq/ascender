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
];

function renderItem(instanceGroup, props = {}) {
  return renderWithContexts(
    <table>
      <tbody>
        <InstanceGroupListItem
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
    renderItem(instanceGroups[0]);
    const row = screen.getByRole('link', { name: 'Foo' }).closest('tr');
    const typeCell = within(row)
      .getAllByRole('cell')
      .find((cell) => cell.getAttribute('data-label') === 'Type');
    expect(typeCell).toHaveTextContent('Instance group');
    // Used capacity is rendered as a Progress bar (100 - 60 = 40).
    expect(within(row).getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '40'
    );
    // edit capability is true -> the edit button is present.
    expect(
      within(row).getByRole('link', { name: 'Edit instance group' })
    ).toBeInTheDocument();
  });

  test('should render the proper data for a container group', () => {
    renderItem(instanceGroups[1]);
    const row = screen.getByRole('link', { name: 'Bar' }).closest('tr');
    const typeCell = within(row)
      .getAllByRole('cell')
      .find((cell) => cell.getAttribute('data-label') === 'Type');
    expect(typeCell).toHaveTextContent('Container group');
    // edit capability is false -> no edit button.
    expect(
      within(row).queryByRole('link', { name: 'Edit instance group' })
    ).not.toBeInTheDocument();
  });

  test('edit button shown to users with edit capabilities', () => {
    renderItem(instanceGroups[0], { isSelected: true });
    expect(
      screen.getByRole('link', { name: 'Edit instance group' })
    ).toBeInTheDocument();
  });

  test('edit button hidden from users without edit capabilities', () => {
    renderItem(instanceGroups[1], { isSelected: true });
    expect(
      screen.queryByRole('link', { name: 'Edit instance group' })
    ).not.toBeInTheDocument();
  });
});
