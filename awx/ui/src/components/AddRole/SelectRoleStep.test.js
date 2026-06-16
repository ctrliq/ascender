import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import SelectRoleStep from './SelectRoleStep';

describe('<SelectRoleStep />', () => {
  const roles = {
    project_admin_role: {
      id: 1,
      name: 'Project Admin',
      description: 'Can manage all projects of the organization',
    },
    execute_role: {
      id: 2,
      name: 'Execute',
      description: 'May run any executable resources in the organization',
    },
  };
  const selectedRoles = [
    {
      id: 1,
      name: 'Project Admin',
      description: 'Can manage all projects of the organization',
    },
  ];
  const selectedResourceRows = [
    {
      id: 1,
      name: 'foo',
    },
  ];

  test('initially renders without crashing', () => {
    renderWithContexts(
      <SelectRoleStep
        roles={roles}
        selectedResourceRows={selectedResourceRows}
        selectedRoleRows={selectedRoles}
      />
    );
    // one CheckboxCard checkbox per role
    expect(screen.getByRole('checkbox', { name: 'Project Admin' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Execute' })).toBeInTheDocument();
  });

  test('clicking role fires onRolesClick callback', async () => {
    const onRolesClick = jest.fn();
    const { user } = renderWithContexts(
      <SelectRoleStep
        onRolesClick={onRolesClick}
        roles={roles}
        selectedResourceRows={selectedResourceRows}
        selectedRoleRows={selectedRoles}
      />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    // click the first CheckboxCard (Project Admin)
    await user.click(screen.getByRole('checkbox', { name: 'Project Admin' }));
    expect(onRolesClick).toHaveBeenCalledWith({
      id: 1,
      name: 'Project Admin',
      description: 'Can manage all projects of the organization',
    });
  });
});
