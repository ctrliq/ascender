import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { OrganizationsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import UserAdd from './UserAdd';

jest.mock('../../../api');

describe('<UserAdd />', () => {
  beforeEach(() => {
    // the OrganizationLookup auto-populates from the only available org
    OrganizationsAPI.read.mockResolvedValue({
      data: {
        count: 1,
        results: [{ id: 1, name: 'Default' }],
      },
    });
  });

  async function fillRequiredFields(user) {
    await user.type(
      screen.getByRole('textbox', { name: 'Username' }),
      'sysadmin'
    );
    // required-field labels render as "Password *", so anchor instead of exact
    await user.type(screen.getByLabelText(/^Password/), 'password');
    await user.type(screen.getByLabelText(/^Confirm Password/), 'password');
  }

  test('handleSubmit should post to api', async () => {
    OrganizationsAPI.createUser.mockResolvedValueOnce({ data: {} });
    const { user } = renderWithContexts(<UserAdd />);
    await screen.findByRole('textbox', { name: 'Username' });

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(OrganizationsAPI.createUser).toHaveBeenCalledWith(1, {
        first_name: '',
        last_name: '',
        email: '',
        username: 'sysadmin',
        password: 'password',
        user_type: 'normal',
        preferred_language: '',
        is_superuser: false,
        is_system_auditor: false,
      })
    );
  });

  test('should navigate to users list when cancel is clicked', async () => {
    const history = createMemoryHistory({});
    const { user } = renderWithContexts(<UserAdd />, {
      context: { router: { history } },
    });
    await screen.findByRole('button', { name: 'Cancel' });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(history.location.pathname).toEqual('/users');
  });

  test('successful form submission should trigger redirect', async () => {
    const history = createMemoryHistory({});
    OrganizationsAPI.createUser.mockResolvedValueOnce({
      data: { id: 5 },
    });
    const { user } = renderWithContexts(<UserAdd />, {
      context: { router: { history } },
    });
    await screen.findByRole('button', { name: 'Save' });

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(history.location.pathname).toEqual('/users/5/details')
    );
  });
});
