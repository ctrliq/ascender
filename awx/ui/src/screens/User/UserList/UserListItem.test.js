import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import mockDetails from '../data.user.json';
import UserListItem from './UserListItem';

describe('UserListItem with full permissions', () => {
  beforeEach(() => {
    renderWithContexts(
      <table>
        <tbody>
          <UserListItem
            user={mockDetails}
            detailUrl="/user/1"
            isSelected
            onSelect={() => {}}
          />
        </tbody>
      </table>
    );
  });

  test('initially renders successfully', () => {
    expect(screen.getByRole('row')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  test('edit button shown to users with edit capabilities', () => {
    expect(screen.getByLabelText('Edit User')).toBeInTheDocument();
  });

  test('should display user data', () => {
    expect(screen.getByText('System Administrator')).toBeInTheDocument();
    expect(screen.getByLabelText('social login')).toHaveTextContent('SOCIAL');
  });
});

describe('UserListItem without full permissions', () => {
  test('edit button hidden from users without edit capabilities', () => {
    renderWithContexts(
      <table>
        <tbody>
          <UserListItem
            user={{
              ...mockDetails,
              summary_fields: {
                user_capabilities: {
                  edit: false,
                },
              },
            }}
            detailUrl="/user/1"
            isSelected
            onSelect={() => {}}
          />
        </tbody>
      </table>
    );
    expect(screen.queryByLabelText('Edit User')).not.toBeInTheDocument();
  });
});
