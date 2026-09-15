import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { WorkflowApprovalsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import PageHeaderToolbar from './PageHeaderToolbar';

vi.mock('../../api');

describe('PageHeaderToolbar', () => {
  const onAboutClick = vi.fn();
  const onLogoutClick = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
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
    expect(
      await screen.findByRole('button', { name: 'Info' })
    ).toBeInTheDocument();
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
    await waitFor(() => expect(WorkflowApprovalsAPI.read).toHaveBeenCalled());
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
    await user.click(userToggle as unknown as Element);

    // PF DropdownItem renders the item with role="menuitem" (the anchor's
    // href is the DOM equivalent of the DropdownItem href prop check)
    const userDetails = await screen.findByRole('menuitem', {
      name: 'User details',
    });
    expect(userDetails).toHaveAttribute('href', '#/users/1/details');

    // clicking Logout fires the callback
    await user.click(screen.getByRole('menuitem', { name: 'Logout' }));
    expect(onLogoutClick).toHaveBeenCalled();
  });

  test('pending workflow approvals count set correctly', async () => {
    vi.mocked(WorkflowApprovalsAPI.read).mockResolvedValueOnce({
      data: {
        count: 20,
      },
    } as unknown as ResponseOf<typeof WorkflowApprovalsAPI.read>);
    const { container } = renderWithContexts(
      <PageHeaderToolbar
        onAboutClick={onAboutClick}
        onLogoutClick={onLogoutClick}
      />
    );

    await waitFor(() => {
      const badge = container.querySelector('#toolbar-workflow-approval-badge');
      expect(
        within(badge as unknown as HTMLElement).getByText('20')
      ).toBeInTheDocument();
    });
  });

  test('the approval badge is one named link, not a button inside one', async () => {
    vi.mocked(WorkflowApprovalsAPI.read).mockResolvedValueOnce({
      data: { count: 0 },
    } as unknown as ResponseOf<typeof WorkflowApprovalsAPI.read>);
    const { container } = renderWithContexts(
      <PageHeaderToolbar
        onAboutClick={onAboutClick}
        onLogoutClick={onLogoutClick}
      />
    );

    const badge = (await waitFor(() =>
      container.querySelector('#toolbar-workflow-approval-badge')
    )) as HTMLElement;

    // an anchor, so it still opens in a new tab, and named, because the bell
    // icon it renders is aria-hidden and there is no count to read at zero
    expect(badge.tagName).toBe('A');
    expect(badge).toHaveAttribute(
      'href',
      expect.stringContaining('workflow_approvals')
    );
    expect(badge).toHaveAccessibleName('Pending Workflow Approvals');
    // nothing interactive inside it: one tab stop, not two
    expect(badge.querySelector('button, a')).toBeNull();
  });
});
