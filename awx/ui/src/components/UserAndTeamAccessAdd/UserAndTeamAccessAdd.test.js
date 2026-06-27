import React from 'react';
import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UsersAPI, JobTemplatesAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import UserAndTeamAccessAdd from './UserAndTeamAccessAdd';

jest.mock('../../api');

const onError = jest.fn();
const onClose = jest.fn();

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
function footerButton(label) {
  return screen
    .getAllByRole('button')
    .find((b) => b.textContent.trim() === label);
}

// Returns the wizard nav <button> for a given step name.
function navItem(name) {
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
    jest.advanceTimersByTime(1200);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('<UserAndTeamAccessAdd/>', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  function setup() {
    const utils = renderWithContexts(
      <UserAndTeamAccessAdd
        apiModel={UsersAPI}
        resourceId={99}
        onFetchData={() => {}}
        onClose={onClose}
        title="Add user permissions"
        onError={onError}
      />
    );
    // a userEvent bound to the fake timers so its internal delays advance
    return {
      ...utils,
      user: userEvent.setup({ advanceTimers: jest.advanceTimersByTime }),
    };
  }

  test('should mount properly', () => {
    setup();
    // The PF Wizard renders its first-step nav item and resource cards.
    expect(navItem('Add resource type')).toBeInTheDocument();
    expect(
      screen.getByText('Job templates', { selector: 'b' })
    ).toBeInTheDocument();
  });

  test('should disable steps', async () => {
    const { user } = setup();
    // Next is disabled and later steps are not jumpable until a resource type
    // is chosen.
    expect(footerButton('Next')).toBeDisabled();
    expect(navItem('Select items from list')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(navItem('Select roles to apply')).toHaveAttribute(
      'aria-disabled',
      'true'
    );

    await user.click(
      document.querySelector('[data-cy="add-role-jobTemplate"]')
    );
    await user.click(footerButton('Next'));
    await settleList();

    expect(navItem('Add resource type')).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(navItem('Select items from list')).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
    // Step 3 stays disabled until a resource row is selected.
    expect(navItem('Select roles to apply')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  test('should call api to associate role', async () => {
    JobTemplatesAPI.read.mockResolvedValue(resources);
    JobTemplatesAPI.readOptions.mockResolvedValue(options);
    UsersAPI.associateRole.mockResolvedValue({});

    const { user } = setup();

    // Step 1: pick a resource type, advance.
    await user.click(
      document.querySelector('[data-cy="add-role-jobTemplate"]')
    );
    await user.click(footerButton('Next'));
    await settleList();

    expect(JobTemplatesAPI.read).toHaveBeenCalledWith({
      order_by: 'name',
      page: 1,
      page_size: 5,
    });
    expect(
      await screen.findByText('Job Template Foo Bar')
    ).toBeInTheDocument();

    // Step 2: select the fetched resource row, advance.
    await user.click(screen.getByText('Job Template Foo Bar'));
    await user.click(footerButton('Next'));

    // Step 3: the roles step renders a checkbox card per object role.
    const adminCard = await screen.findByRole('checkbox', { name: 'Admin' });
    await user.click(adminCard);
    await user.click(footerButton('Save'));

    // associate must use the resourceId passed by the parent screen (99), not a
    // route param (empty under react-router v6).
    await waitFor(() =>
      expect(UsersAPI.associateRole).toHaveBeenCalledWith(99, expect.any(Number))
    );
  });

  test('should close wizard on cancel', async () => {
    const { user } = setup();
    await user.click(footerButton('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('should throw error', async () => {
    expect(onError).toHaveBeenCalledTimes(0);
    JobTemplatesAPI.read.mockResolvedValue(resources);
    JobTemplatesAPI.readOptions.mockResolvedValue(options);
    UsersAPI.associateRole.mockRejectedValue(
      new Error({
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
      document.querySelector('[data-cy="add-role-jobTemplate"]')
    );
    await user.click(footerButton('Next'));
    await settleList();

    expect(JobTemplatesAPI.read).toHaveBeenCalled();
    expect(
      await screen.findByText('Job Template Foo Bar')
    ).toBeInTheDocument();

    await user.click(screen.getByText('Job Template Foo Bar'));
    await user.click(footerButton('Next'));

    const adminCard = await screen.findByRole('checkbox', { name: 'Admin' });
    await user.click(adminCard);
    await user.click(footerButton('Save'));

    await waitFor(() => expect(UsersAPI.associateRole).toHaveBeenCalled());
    await waitFor(() => expect(onError).toHaveBeenCalled());
  });
});
