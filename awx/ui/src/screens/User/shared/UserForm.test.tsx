import type { Untyped } from 'types/api';
import type { ApiResponse } from 'api/Base';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { OrganizationsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import UserForm from './UserForm';
import mockData from '../data.user.json';

vi.mock('../../../api');

describe('<UserForm />', () => {
  beforeEach(() => {
    // the add-mode OrganizationLookup auto-populates on mount; return two
    // orgs so it does not auto-select one
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      data: {
        count: 2,
        results: [
          { id: 1, name: 'organization', url: '/api/v2/organizations/1/' },
          { id: 2, name: 'other org', url: '/api/v2/organizations/2/' },
        ],
      },
    } as unknown as ApiResponse<Untyped>);
    vi.mocked(OrganizationsAPI.readOptions).mockResolvedValue({
      data: {
        actions: { GET: {}, POST: {} },
        related_search_fields: [],
      },
    } as unknown as ApiResponse<Untyped>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('initially renders successfully', async () => {
    renderWithContexts(
      <UserForm handleSubmit={vi.fn()} handleCancel={vi.fn()} />
    );

    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });

  test('add form displays all form fields', async () => {
    renderWithContexts(
      <UserForm handleSubmit={vi.fn()} handleCancel={vi.fn()} />
    );
    await screen.findByRole('button', { name: 'Save' });

    expect(
      screen.getByRole('textbox', { name: 'Username' })
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'First Name' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Last Name' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Confirm Password/)).toBeInTheDocument();
    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.getByText('User Type')).toBeInTheDocument();
  });

  test('edit form hides org field', async () => {
    renderWithContexts(
      <UserForm handleSubmit={vi.fn()} handleCancel={vi.fn()} user={mockData} />
    );
    await screen.findByRole('button', { name: 'Save' });

    expect(screen.queryByText('Organization')).not.toBeInTheDocument();
  });

  test('inputs should update form value on change', async () => {
    const { user } = renderWithContexts(
      <UserForm handleSubmit={vi.fn()} handleCancel={vi.fn()} />
    );
    await screen.findByRole('button', { name: 'Save' });

    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.click(await screen.findByText('organization'));
    await user.click(screen.getByRole('button', { name: 'Select' }));

    expect(screen.getByDisplayValue('organization')).toBeInTheDocument();
  });

  test('fields required on add', async () => {
    renderWithContexts(
      <UserForm handleSubmit={vi.fn()} handleCancel={vi.fn()} />
    );
    await screen.findByRole('button', { name: 'Save' });

    expect(screen.getByRole('textbox', { name: 'Username' })).toBeRequired();
    expect(screen.getByLabelText(/^Password/)).toBeRequired();
    expect(screen.getByLabelText(/^Confirm Password/)).toBeRequired();
  });

  test('username field is required on edit', async () => {
    renderWithContexts(
      <UserForm
        user={{ ...mockData, external_account: '', auth: [] }}
        handleSubmit={vi.fn()}
        handleCancel={vi.fn()}
      />
    );
    await screen.findByRole('button', { name: 'Save' });

    expect(screen.getByRole('textbox', { name: 'Username' })).toBeRequired();
  });

  test('password fields are not required on edit', async () => {
    renderWithContexts(
      <UserForm
        user={{ ...mockData, external_account: '', auth: [] }}
        handleSubmit={vi.fn()}
        handleCancel={vi.fn()}
      />
    );
    await screen.findByRole('button', { name: 'Save' });

    expect(screen.getByLabelText(/^Password/)).not.toBeRequired();
    expect(screen.getByLabelText(/^Confirm Password/)).not.toBeRequired();
  });

  test('username should not be required for external accounts', async () => {
    renderWithContexts(
      <UserForm user={mockData} handleSubmit={vi.fn()} handleCancel={vi.fn()} />
    );
    await screen.findByRole('button', { name: 'Save' });

    expect(
      screen.getByRole('textbox', { name: 'Username' })
    ).not.toBeRequired();
  });

  test('username should not be required for ldap accounts', async () => {
    renderWithContexts(
      <UserForm
        user={{
          ...mockData,
          ldap_dn: 'uid=binduser,cn=users,cn=accounts,dc=lan,dc=example,dc=com',
        }}
        handleSubmit={vi.fn()}
        handleCancel={vi.fn()}
      />
    );
    await screen.findByRole('button', { name: 'Save' });

    expect(
      screen.getByRole('textbox', { name: 'Username' })
    ).not.toBeRequired();
  });

  test('password fields are not displayed for social/ldap login', async () => {
    renderWithContexts(
      <UserForm user={mockData} handleSubmit={vi.fn()} handleCancel={vi.fn()} />
    );
    await screen.findByRole('button', { name: 'Save' });

    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/^Confirm Password/)
    ).not.toBeInTheDocument();
  });

  test('should call handleSubmit when Submit button is clicked', async () => {
    const handleSubmit = vi.fn();
    const { user } = renderWithContexts(
      <UserForm
        user={mockData}
        handleSubmit={handleSubmit}
        handleCancel={vi.fn()}
      />
    );
    await screen.findByRole('button', { name: 'Save' });

    expect(handleSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(handleSubmit).toHaveBeenCalled());
  });

  test('should call handleCancel when Cancel button is clicked', async () => {
    const handleCancel = vi.fn();
    const { user } = renderWithContexts(
      <UserForm
        user={mockData}
        handleSubmit={vi.fn()}
        handleCancel={handleCancel}
      />
    );
    await screen.findByRole('button', { name: 'Save' });

    expect(handleCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(handleCancel).toHaveBeenCalled();
  });

  test('should not show user type field', async () => {
    renderWithContexts(
      <UserForm
        user={mockData}
        handleSubmit={vi.fn()}
        handleCancel={vi.fn()}
      />,
      {
        context: {
          config: {
            me: { is_superuser: false },
          },
        },
      }
    );
    await screen.findByRole('button', { name: 'Save' });

    expect(screen.queryByText('User Type')).not.toBeInTheDocument();
  });
});
