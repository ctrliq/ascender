import type { ApiResponse } from 'api/Base';

import React from 'react';
import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UsersAPI, JobTemplatesAPI, InstanceGroupsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import UserAndTeamAccessAdd from './UserAndTeamAccessAdd';

vi.mock('../../api');

const onError = vi.fn();
const onClose = vi.fn();
const onFetchData = vi.fn();

const resources = {
  data: {
    results: [
      {
        id: 1,
        name: 'Job Template Foo Bar',
        url: '/api/v2/job_template/1/',
        summary_fields: {
          object_roles: {
            admin_role: {
              description: 'Can manage all aspects of the job template',
              name: 'Admin',
              id: 164,
            },
            execute_role: {
              description: 'May run the job template',
              name: 'Execute',
              id: 165,
            },
            read_role: {
              description: 'May view settings for the job template',
              name: 'Read',
              id: 166,
            },
          },
        },
      },
    ],
    count: 1,
  },
};
const options = {
  data: {
    actions: {
      GET: {},
      POST: {},
    },
    related_search_fields: [],
  },
};

// Returns the PF Wizard footer navigation button by its visible label.
function footerButton(label: string) {
  return screen
    .getAllByRole('button')
    .find((b) => b.textContent.trim() === label);
}

// Returns the wizard nav <button> for a given step name.
function navItem(name: string) {
  return screen
    .getAllByRole('button')
    .find(
      (b) =>
        b.classList.contains('pf-v6-c-wizard__nav-link') &&
        b.textContent.trim() === name
    );
}

// SelectResourceStep issues a debounced (1000ms) API read on mount; advance
// timers + flush microtasks so the list renders, without clicking in a
// retry loop.
async function settleList() {
  // advance past the 1000ms debounce with fake timers (instead of sleeping a
  // real 1.2s) and flush the resulting microtasks so the list renders
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    vi.advanceTimersByTime(1200);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('<UserAndTeamAccessAdd/>', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  function setup() {
    const utils = renderWithContexts(
      <UserAndTeamAccessAdd
        apiModel={UsersAPI}
        resourceId={99}
        onFetchData={onFetchData}
        onClose={onClose}
        title="Associate User Roles"
        onError={onError}
      />
    );
    // a userEvent bound to the fake timers so its internal delays advance
    return {
      ...utils,
      user: userEvent.setup({ advanceTimers: vi.advanceTimersByTime }),
    };
  }

  test('should mount properly', () => {
    setup();
    // The PF Wizard renders its first-step nav item and resource cards.
    expect(navItem('Select a Resource Type')).toBeInTheDocument();
    expect(
      screen.getByText('Job Templates', { selector: 'b' })
    ).toBeInTheDocument();
  });

  test('should disable steps', async () => {
    const { user } = setup();
    // Next is disabled and later steps are not jumpable until a resource type
    // is chosen.
    expect(footerButton('Next')).toBeDisabled();
    expect(navItem('Select Items from List')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(navItem('Select Roles to Apply')).toHaveAttribute(
      'aria-disabled',
      'true'
    );

    await user.click(
      document.querySelector('[data-cy="add-role-jobTemplate"]')!
    );
    await user.click(footerButton('Next')!);
    await settleList();

    expect(navItem('Select a Resource Type')).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(navItem('Select Items from List')).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
    // Step 3 stays disabled until a resource row is selected.
    expect(navItem('Select Roles to Apply')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  test('should call api to associate role', async () => {
    vi.mocked(JobTemplatesAPI.read).mockResolvedValue(
      resources as unknown as ApiResponse<unknown>
    );
    vi.mocked(JobTemplatesAPI.readOptions).mockResolvedValue(
      options as unknown as ApiResponse<unknown>
    );
    vi.mocked(UsersAPI.associateRole).mockResolvedValue(
      {} as unknown as ResponseOf<typeof UsersAPI.associateRole>
    );

    const { user } = setup();

    // Step 1: pick a resource type, advance.
    await user.click(
      document.querySelector('[data-cy="add-role-jobTemplate"]')!
    );
    await user.click(footerButton('Next')!);
    await settleList();

    expect(JobTemplatesAPI.read).toHaveBeenCalledWith({
      order_by: 'name',
      page: 1,
      page_size: 5,
    });
    expect(await screen.findByText('Job Template Foo Bar')).toBeInTheDocument();

    // Step 2: select the fetched resource row, advance.
    await user.click(screen.getByText('Job Template Foo Bar'));
    await user.click(footerButton('Next')!);

    // Step 3: the roles step renders a checkbox card per object role.
    const adminCard = await screen.findByRole('checkbox', { name: 'Admin' });
    await user.click(adminCard);
    await user.click(footerButton('Associate')!);

    // associate must use the resourceId passed by the parent screen (99), not a
    // route param (empty under react-router v6).
    await waitFor(() =>
      expect(UsersAPI.associateRole).toHaveBeenCalledWith(
        99,
        expect.any(Number)
      )
    );
  });

  /*
   * Associating with no role ticked would post nothing and close the wizard as
   * though it had worked, so the last step waits for a role.
   */
  test('keeps Associate disabled until a role is selected', async () => {
    vi.mocked(JobTemplatesAPI.read).mockResolvedValue(
      resources as unknown as ApiResponse<unknown>
    );
    vi.mocked(JobTemplatesAPI.readOptions).mockResolvedValue(
      options as unknown as ApiResponse<unknown>
    );

    const { user } = setup();

    await user.click(
      document.querySelector('[data-cy="add-role-jobTemplate"]')!
    );
    await user.click(footerButton('Next')!);
    await settleList();
    await user.click(await screen.findByText('Job Template Foo Bar'));
    await user.click(footerButton('Next')!);

    const adminCard = await screen.findByRole('checkbox', { name: 'Admin' });
    expect(footerButton('Associate')).toBeDisabled();
    await user.click(adminCard);
    expect(footerButton('Associate')).toBeEnabled();
  });

  /* An instance group has no creator or last editor, and the api refuses a
     filter on either, so its list offers only its name to search by. */
  test('should search instance groups by name only', async () => {
    vi.mocked(InstanceGroupsAPI.read).mockResolvedValue({
      data: { count: 1, results: [{ id: 1, name: 'default' }] },
    } as unknown as ApiResponse<unknown>);
    vi.mocked(InstanceGroupsAPI.readOptions).mockResolvedValue(
      options as unknown as ApiResponse<unknown>
    );
    const { user } = setup();

    await user.click(
      document.querySelector('[data-cy="add-role-instanceGroup"]')!
    );
    await user.click(footerButton('Next')!);
    await settleList();

    expect(await screen.findByText('default')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Simple key select' }));
    await screen.findByRole('listbox');
    expect(
      screen.queryByRole('option', { name: 'Created By (Username)' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Modified By (Username)' })
    ).not.toBeInTheDocument();
  });

  test('should close wizard on cancel', async () => {
    const { user } = setup();
    await user.click(footerButton('Cancel')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('should throw error', async () => {
    expect(onError).toHaveBeenCalledTimes(0);
    vi.mocked(JobTemplatesAPI.read).mockResolvedValue(
      resources as unknown as ApiResponse<unknown>
    );
    vi.mocked(JobTemplatesAPI.readOptions).mockResolvedValue(
      options as unknown as ApiResponse<unknown>
    );
    vi.mocked(UsersAPI.associateRole).mockRejectedValue(
      Object.assign(new Error('An error occurred'), {
        response: {
          config: {
            method: 'post',
            url: '/api/v2/users/a/roles',
          },
          data: 'An error occurred',
          status: 403,
        },
      })
    );

    const { user } = setup();

    await user.click(
      document.querySelector('[data-cy="add-role-jobTemplate"]')!
    );
    await user.click(footerButton('Next')!);
    await settleList();

    expect(JobTemplatesAPI.read).toHaveBeenCalled();
    expect(await screen.findByText('Job Template Foo Bar')).toBeInTheDocument();

    await user.click(screen.getByText('Job Template Foo Bar'));
    await user.click(footerButton('Next')!);

    const adminCard = await screen.findByRole('checkbox', { name: 'Admin' });
    await user.click(adminCard);
    await user.click(footerButton('Associate')!);

    await waitFor(() => expect(UsersAPI.associateRole).toHaveBeenCalled());
    await waitFor(() => expect(onError).toHaveBeenCalled());
    // Handed over once, from the failed request, rather than on every render
    // that follows it.
    expect(onError).toHaveBeenCalledTimes(1);
    // Some of the roles may have gone through, so the list is read again
    // rather than the wizard simply closing on it.
    expect(onFetchData).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
