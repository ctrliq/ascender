import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { UsersAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import UserDetail from './UserDetail';
import mockDetails from '../data.user.json';

jest.mock('../../../api');

describe('<UserDetail />', () => {
  test('initially renders successfully', () => {
    renderWithContexts(<UserDetail user={mockDetails} />);
    expect(screen.getByText('Username')).toBeInTheDocument();
  });

  test('should render Details', () => {
    renderWithContexts(<UserDetail user={mockDetails} />);

    assertDetail('Username', mockDetails.username);
    assertDetail('Email', mockDetails.email);
    assertDetail('First Name', mockDetails.first_name);
    assertDetail('Last Name', mockDetails.last_name);
    assertDetail('User Type', 'System Administrator');
    assertDetail('Last Login', '11/4/2019, 11:12:36 PM');
    assertDetail('Created', '10/28/2019, 3:01:07 PM');
    assertDetail('Last Modified', '7/12/2021, 7:08:33 PM');
    assertDetail('Type', 'SOCIAL');
  });

  test('User Type Detail should render expected strings', () => {
    const { unmount } = renderWithContexts(
      <UserDetail
        user={{
          ...mockDetails,
          is_superuser: false,
          is_system_auditor: true,
        }}
      />
    );
    assertDetail('User Type', 'System Auditor');
    unmount();

    renderWithContexts(
      <UserDetail
        user={{
          ...mockDetails,
          is_superuser: false,
          is_system_auditor: false,
        }}
      />
    );
    assertDetail('User Type', 'Normal User');
  });

  test('should show edit button for users with edit permission', () => {
    renderWithContexts(<UserDetail user={mockDetails} />);

    const editLink = screen.getByRole('link', { name: 'edit' });
    expect(editLink).toHaveAttribute('href', `/users/${mockDetails.id}/edit`);
  });

  test('should hide edit button for users without edit permission', () => {
    renderWithContexts(
      <UserDetail
        user={{
          ...mockDetails,
          summary_fields: {
            user_capabilities: {
              edit: false,
            },
          },
        }}
      />
    );
    expect(screen.queryByRole('link', { name: 'edit' })).not.toBeInTheDocument();
  });

  test('edit button should navigate to user edit', async () => {
    const history = createMemoryHistory();
    const { user } = renderWithContexts(<UserDetail user={mockDetails} />, {
      context: { router: { history } },
    });

    await user.click(screen.getByRole('link', { name: 'edit' }));

    expect(history.location.pathname).toEqual('/users/1/edit');
  });

  test('expected api call is made for delete', async () => {
    UsersAPI.destroy.mockResolvedValueOnce({});
    const { user } = renderWithContexts(<UserDetail user={mockDetails} />);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );

    await waitFor(() => expect(UsersAPI.destroy).toHaveBeenCalledTimes(1));
  });

  test('Error dialog shown for failed deletion', async () => {
    UsersAPI.destroy.mockRejectedValueOnce(new Error());
    const { user } = renderWithContexts(<UserDetail user={mockDetails} />);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();
    expect(screen.getByText('Failed to delete user.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
  });
});
