import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { UsersAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import UserEdit from './UserEdit';
import type { User } from '../../../types/api';

vi.mock('../../../api');

describe('<UserEdit />', () => {
  const mockData = {
    id: 1,
    username: 'sysadmin',
    email: 'sysadmin@ansible.com',
    first_name: 'System',
    last_name: 'Administrator',
    password: 'password',
    organization: 1,
    is_superuser: true,
    is_system_auditor: false,
  };

  test('handleSubmit should call api update', async () => {
    const { user } = renderWithContexts(
      <UserEdit user={mockData as unknown as User} />
    );

    const usernameInput = screen.getByRole('textbox', { name: 'Username' });
    await user.clear(usernameInput);
    await user.type(usernameInput, 'Foo');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(UsersAPI.update).toHaveBeenCalledWith(1, {
        first_name: 'System',
        last_name: 'Administrator',
        email: 'sysadmin@ansible.com',
        username: 'Foo',
        user_type: 'administrator',
        preferred_language: '',
        is_superuser: true,
        is_system_auditor: false,
      });
    });
  });

  test('should navigate to user detail when cancel is clicked', async () => {
    const { history, user } = renderWithContexts(
      <UserEdit user={mockData as unknown as User} />
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(history.location.pathname).toEqual('/users/1/details');
  });

  test('saving your own user records and applies the theme', async () => {
    localStorage.removeItem('theme');
    sessionStorage.removeItem('theme');
    const { user } = renderWithContexts(
      <UserEdit
        user={{ ...mockData, preferred_theme: 'light' } as unknown as User}
      />,
      { context: { config: { me: { id: 1, is_superuser: true } } } }
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(UsersAPI.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ preferred_theme: 'light' })
      );
    });
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    );
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
