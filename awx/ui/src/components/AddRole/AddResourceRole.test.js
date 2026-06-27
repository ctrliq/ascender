import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import { TeamsAPI, UsersAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import AddResourceRole from './AddResourceRole';

jest.mock('../../api/models/Teams');
jest.mock('../../api/models/Users');

// TODO: Once error handling is functional in
// this component write tests for it

// The wizard footer's primary button is labelled "Next" until the last step,
// where it becomes "Save". Helper to grab whichever is currently shown.
const getPrimaryButton = () =>
  screen.queryByRole('button', { name: 'Next' }) ||
  screen.getByRole('button', { name: 'Save' });

describe('<AddResourceRole />', () => {
  const roles = {
    admin_role: {
      description: 'Can manage all aspects of the organization',
      id: 1,
      name: 'Admin',
    },
    execute_role: {
      description: 'May run any executable resources in the organization',
      id: 2,
      name: 'Execute',
    },
  };

  beforeEach(() => {
    UsersAPI.read.mockResolvedValue({
      data: {
        count: 2,
        results: [
          { id: 1, username: 'foo', url: '' },
          { id: 2, username: 'bar', url: '' },
          { id: 3, username: 'baz', url: '' },
        ],
      },
    });
    UsersAPI.readOptions.mockResolvedValue({
      data: { related: {}, actions: { GET: {} } },
    });
    TeamsAPI.read.mockResolvedValue({
      data: {
        count: 2,
        results: [
          { id: 1, name: 'Team foo', url: '' },
          { id: 2, name: 'Team bar', url: '' },
        ],
      },
    });
    TeamsAPI.readOptions.mockResolvedValue({
      data: { related: {}, actions: { GET: {} } },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially renders without crashing', () => {
    renderWithContexts(
      <AddResourceRole onClose={() => {}} onSave={() => {}} roles={roles} />
    );
    expect(screen.getByRole('button', { name: 'Users' })).toBeInTheDocument();
  });

  test('should save properly', async () => {
    const { user } = renderWithContexts(
      <AddResourceRole onClose={() => {}} onSave={() => {}} roles={roles} />
    );

    // Step 1 - two resource-type cards
    expect(screen.getByRole('button', { name: 'Users' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Teams' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Users' }));
    await user.click(getPrimaryButton());

    // Step 2 - select foo, bar, baz then deselect baz
    const fooRow = (await screen.findByText('foo')).closest('tr');
    const barRow = screen.getByText('bar').closest('tr');
    const bazRow = screen.getByText('baz').closest('tr');
    await user.click(within(fooRow).getByRole('checkbox'));
    await user.click(within(barRow).getByRole('checkbox'));
    await user.click(within(bazRow).getByRole('checkbox'));
    await user.click(within(bazRow).getByRole('checkbox'));

    // isSelected prop -> checkbox checked state
    expect(within(fooRow).getByRole('checkbox')).toBeChecked();
    expect(within(barRow).getByRole('checkbox')).toBeChecked();
    expect(within(bazRow).getByRole('checkbox')).not.toBeChecked();

    // Two selected items show in the SelectedList as PF Labels with close buttons.
    expect(
      document.querySelectorAll('.pf-v6-c-label .pf-v6-c-label__actions button')
    ).toHaveLength(2);

    await user.click(getPrimaryButton());

    // Step 3 - check the Admin role
    const adminCheckbox = await screen.findByRole('checkbox', { name: 'Admin' });
    await user.click(adminCheckbox);
    expect(adminCheckbox).toBeChecked();

    // Save
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(UsersAPI.associateRole).toHaveBeenCalledTimes(2)
    );
    expect(UsersAPI.associateRole).toHaveBeenCalledWith(1, 1);
    expect(UsersAPI.associateRole).toHaveBeenCalledWith(2, 1);
  });

  test('should call on error properly', async () => {
    const onError = jest.fn();
    UsersAPI.associateRole.mockRejectedValue(
      new Error({
        response: {
          config: {
            method: 'post',
            url: '/api/v2/users',
          },
          data: 'An error occurred',
          status: 403,
        },
      })
    );
    const { user } = renderWithContexts(
      <AddResourceRole
        onClose={() => {}}
        onError={onError}
        onSave={() => {}}
        roles={roles}
      />
    );

    // Step 1
    await user.click(screen.getByRole('button', { name: 'Users' }));
    await user.click(getPrimaryButton());

    // Step 2
    const fooRow = (await screen.findByText('foo')).closest('tr');
    await user.click(within(fooRow).getByRole('checkbox'));
    expect(within(fooRow).getByRole('checkbox')).toBeChecked();
    await user.click(getPrimaryButton());

    // Step 3
    const adminCheckbox = await screen.findByRole('checkbox', { name: 'Admin' });
    await user.click(adminCheckbox);
    expect(adminCheckbox).toBeChecked();

    // Save
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(UsersAPI.associateRole).toHaveBeenCalledWith(1, 1);
  });

  test('should update history properly', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/organizations/2/access?resource.order_by=-username'],
    });
    const { user } = renderWithContexts(
      <AddResourceRole onClose={() => {}} onSave={() => {}} roles={roles} />,
      { context: { router: { history } } }
    );

    // Step 1
    await user.click(screen.getByRole('button', { name: 'Users' }));
    await user.click(getPrimaryButton());

    // Step 2
    const fooRow = (await screen.findByText('foo')).closest('tr');
    await user.click(within(fooRow).getByRole('checkbox'));
    expect(within(fooRow).getByRole('checkbox')).toBeChecked();

    // Jump back to step 1 via the wizard nav -> effect resets the query string
    await user.click(
      screen.getByRole('button', { name: 'Select a Resource Type' })
    );
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/organizations/2/access')
    );
    expect(history.location.search).toEqual('');
  });

  test('should successfuly click user/team cards', async () => {
    const { user } = renderWithContexts(
      <AddResourceRole onClose={() => {}} onSave={() => {}} roles={roles} />
    );

    const usersCard = screen.getByRole('button', { name: 'Users' });
    const teamsCard = screen.getByRole('button', { name: 'Teams' });

    await user.click(usersCard);
    // SelectableCard isSelected -> active-color border; assert via aria-current
    // equivalent: the card stays in the document and Next becomes enabled
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    );

    await user.click(teamsCard);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    );
  });

  test('should reset values with resource type changes', async () => {
    const { user } = renderWithContexts(
      <AddResourceRole onClose={() => {}} onSave={() => {}} roles={roles} />
    );

    // Step 1
    await user.click(screen.getByRole('button', { name: 'Users' }));
    await user.click(getPrimaryButton());

    // Step 2 - select foo
    const fooRow = (await screen.findByText('foo')).closest('tr');
    await user.click(within(fooRow).getByRole('checkbox'));
    expect(within(fooRow).getByRole('checkbox')).toBeChecked();
    await user.click(getPrimaryButton());

    // Step 3 - check Admin
    const adminCheckbox = await screen.findByRole('checkbox', { name: 'Admin' });
    await user.click(adminCheckbox);
    expect(adminCheckbox).toBeChecked();

    // Go back to step 1 via nav
    await user.click(
      screen.getByRole('button', { name: 'Select a Resource Type' })
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Select a Resource Type' })
      ).toHaveAttribute('aria-current', 'step')
    );

    // Select Teams this time -> clears selections in following steps
    await user.click(screen.getByRole('button', { name: 'Teams' }));
    await user.click(getPrimaryButton());

    // Step 2 (teams) - nothing carried over: no team checkbox is checked, so
    // Next is disabled (proves the prior user selection was cleared)
    const teamRow = (await screen.findByText('Team foo')).closest('tr');
    screen
      .getAllByRole('checkbox')
      .forEach((box) => expect(box).not.toBeChecked());
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    // pick a team to advance to the roles step
    await user.click(within(teamRow).getByRole('checkbox'));
    await user.click(getPrimaryButton());

    // Step 3 - no roles carried over from the earlier Admin selection
    const roleCheckboxes = await screen.findAllByRole('checkbox', {
      name: /Admin|Execute/,
    });
    roleCheckboxes.forEach((box) => expect(box).not.toBeChecked());

    // Save button disabled (no roles selected)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('should not display team as a choice in case credential does not have organization', async () => {
    const { user } = renderWithContexts(
      <AddResourceRole
        onClose={() => {}}
        onSave={() => {}}
        roles={roles}
        resource={{ type: 'credential', organization: null }}
      />
    );

    expect(screen.getByRole('button', { name: 'Users' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Teams' })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Users' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    );
  });

  test('should show correct button text', async () => {
    const { user } = renderWithContexts(
      <AddResourceRole onClose={() => {}} onSave={() => {}} roles={roles} />
    );

    // Step 1
    await user.click(screen.getByRole('button', { name: 'Users' }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Step 2
    const fooRow = (await screen.findByText('foo')).closest('tr');
    await user.click(within(fooRow).getByRole('checkbox'));
    expect(within(fooRow).getByRole('checkbox')).toBeChecked();
    // a single selected chip (with its "close" button) appears for foo
    expect(
      document.querySelectorAll('.pf-v6-c-label .pf-v6-c-label__actions button')
    ).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Step 3 - primary button is Save
    const adminCheckbox = await screen.findByRole('checkbox', { name: 'Admin' });
    await user.click(adminCheckbox);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();

    // Go Back -> primary button is Next again
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(
      await screen.findByRole('button', { name: 'Next' })
    ).toBeInTheDocument();

    // Return to last step -> Save again
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });
});
