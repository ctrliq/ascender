import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { WorkflowApprovalsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import PageHeaderToolbar from './PageHeaderToolbar';

jest.mock('../../api');

describe('PageHeaderToolbar', () => {
  const onAboutClick = jest.fn();
  const onLogoutClick = jest.fn();

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('expected content is rendered on initialization', async () => {
    const { container } = renderWithContexts(
      <PageHeaderToolbar
        onAboutClick={onAboutClick}
        onLogoutClick={onLogoutClick}
      />
    );

    // help dropdown toggle (aria-label Info) and user dropdown toggle. Wait
    // for the on-mount approvals request to settle so its setState lands inside
    // act before asserting.
    expect(await screen.findByRole('button', { name: 'Info' })).toBeInTheDocument();
    expect(
      container.querySelector(
        'a[href="/workflow_approvals?workflow_approvals.status=pending"]'
      )
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-ouia-component-id="toolbar-user-dropdown-toggle"]'
      )
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(WorkflowApprovalsAPI.read).toHaveBeenCalled()
    );
  });

  test('dropdowns have expected items and callbacks', async () => {
    const { user } = renderWithContexts(
      <PageHeaderToolbar
        onAboutClick={onAboutClick}
        onLogoutClick={onLogoutClick}
        loggedInUser={{ id: 1 }}
      />
    );
    // wait for the on-mount approvals request to settle
    await screen.findByRole('button', { name: 'Info' });

    // help dropdown items are not rendered until the toggle is clicked
    expect(screen.queryByText('About')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Info' }));
    expect(screen.getByText('Help')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();

    // clicking About fires the callback
    await user.click(screen.getByText('About'));
    expect(onAboutClick).toHaveBeenCalled();

    // open the user dropdown (item carries aria-label "User details")
    const userToggle = document.querySelector(
      '[data-ouia-component-id="toolbar-user-dropdown-toggle"]'
    );
    await user.click(userToggle);

    // PF DropdownItem renders the item with role="menuitem" (the anchor's
    // href is the DOM equivalent of the enzyme DropdownItem href prop check)
    const userDetails = await screen.findByRole('menuitem', {
      name: 'User details',
    });
    expect(userDetails).toHaveAttribute('href', '#/users/1/details');

    // clicking Logout fires the callback
    await user.click(screen.getByRole('menuitem', { name: 'Logout' }));
    expect(onLogoutClick).toHaveBeenCalled();
  });

  test('pending workflow approvals count set correctly', async () => {
    WorkflowApprovalsAPI.read.mockResolvedValueOnce({
      data: {
        count: 20,
      },
    });
    const { container } = renderWithContexts(
      <PageHeaderToolbar
        onAboutClick={onAboutClick}
        onLogoutClick={onLogoutClick}
      />
    );

    await waitFor(() => {
      const badge = container.querySelector(
        '#toolbar-workflow-approval-badge'
      );
      expect(within(badge).getByText('20')).toBeInTheDocument();
    });
  });
});
