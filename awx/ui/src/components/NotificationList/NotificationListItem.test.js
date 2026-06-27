import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import NotificationListItem from './NotificationListItem';

describe('<NotificationListItem canToggleNotifications />', () => {
  let toggleNotification;

  const mockNotif = {
    id: 9000,
    name: 'Foo',
    notification_type: 'slack',
  };

  const typeLabels = {
    slack: 'Slack',
  };

  function setup(props = {}) {
    return renderWithContexts(
      <table>
        <tbody>
          <NotificationListItem
            notification={mockNotif}
            toggleNotification={toggleNotification}
            detailUrl="/foo"
            canToggleNotifications
            typeLabels={typeLabels}
            {...props}
          />
        </tbody>
      </table>
    );
  }

  beforeEach(() => {
    toggleNotification = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially renders successfully and displays correct label', () => {
    setup();
    expect(screen.getAllByRole('switch')).toHaveLength(3);
  });

  test('shows approvals toggle when configured', () => {
    setup({ showApprovalsToggle: true });
    expect(screen.getAllByRole('switch')).toHaveLength(4);
  });

  test('displays correct type', () => {
    setup();
    expect(screen.getByText('Slack')).toBeInTheDocument();
  });

  test('handles approvals click when toggle is on', async () => {
    const { user } = setup({ showApprovalsToggle: true, approvalsTurnedOn: true });
    await user.click(
      screen.getByRole('switch', { name: 'Toggle notification approvals' })
    );
    expect(toggleNotification).toHaveBeenCalledWith(9000, true, 'approvals');
  });

  test('handles approvals click when toggle is off', async () => {
    const { user } = setup({
      showApprovalsToggle: true,
      approvalsTurnedOn: false,
    });
    await user.click(
      screen.getByRole('switch', { name: 'Toggle notification approvals' })
    );
    expect(toggleNotification).toHaveBeenCalledWith(9000, false, 'approvals');
  });

  test('handles started click when toggle is on', async () => {
    const { user } = setup({ startedTurnedOn: true });
    await user.click(
      screen.getByRole('switch', { name: 'Toggle notification start' })
    );
    expect(toggleNotification).toHaveBeenCalledWith(9000, true, 'started');
  });

  test('handles started click when toggle is off', async () => {
    const { user } = setup({ startedTurnedOn: false });
    await user.click(
      screen.getByRole('switch', { name: 'Toggle notification start' })
    );
    expect(toggleNotification).toHaveBeenCalledWith(9000, false, 'started');
  });

  test('handles success click when toggle is on', async () => {
    const { user } = setup({ successTurnedOn: true });
    await user.click(
      screen.getByRole('switch', { name: 'Toggle notification success' })
    );
    expect(toggleNotification).toHaveBeenCalledWith(9000, true, 'success');
  });

  test('handles success click when toggle is off', async () => {
    const { user } = setup({ successTurnedOn: false });
    await user.click(
      screen.getByRole('switch', { name: 'Toggle notification success' })
    );
    expect(toggleNotification).toHaveBeenCalledWith(9000, false, 'success');
  });

  test('handles error click when toggle is on', async () => {
    const { user } = setup({ errorTurnedOn: true });
    await user.click(
      screen.getByRole('switch', { name: 'Toggle notification failure' })
    );
    expect(toggleNotification).toHaveBeenCalledWith(9000, true, 'error');
  });

  test('handles error click when toggle is off', async () => {
    const { user } = setup({ errorTurnedOn: false });
    await user.click(
      screen.getByRole('switch', { name: 'Toggle notification failure' })
    );
    expect(toggleNotification).toHaveBeenCalledWith(9000, false, 'error');
  });
});
