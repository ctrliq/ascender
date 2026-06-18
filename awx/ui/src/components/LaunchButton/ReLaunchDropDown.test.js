import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ReLaunchDropDown from './ReLaunchDropDown';

describe('ReLaunchDropDown', () => {
  test('expected content is rendered on initialization', () => {
    renderWithContexts(<ReLaunchDropDown handleRelaunch={() => {}} />);

    expect(
      screen.getByRole('button', { name: 'relaunch jobs' })
    ).toBeInTheDocument();
  });

  test('dropdown have expected items and callbacks', async () => {
    const handleRelaunch = jest.fn();
    const { user } = renderWithContexts(
      <ReLaunchDropDown handleRelaunch={handleRelaunch} />
    );

    // closed until the toggle is clicked
    expect(
      screen.queryByRole('menuitem', { name: 'Relaunch failed hosts' })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'relaunch jobs' }));

    // the menu stays open after a selection, so both items are reachable
    await user.click(
      screen.getByRole('menuitem', { name: 'Relaunch failed hosts' })
    );
    expect(handleRelaunch).toHaveBeenCalledWith({ hosts: 'failed' });

    await user.click(
      screen.getByRole('menuitem', { name: 'Relaunch all hosts' })
    );
    expect(handleRelaunch).toHaveBeenCalledWith({ hosts: 'all' });
  });

  test('dropdown isPrimary have expected items and callbacks', async () => {
    const handleRelaunch = jest.fn();
    const { user } = renderWithContexts(
      <ReLaunchDropDown isPrimary handleRelaunch={handleRelaunch} />
    );

    expect(
      screen.queryByRole('menuitem', { name: 'Relaunch failed hosts' })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'relaunch jobs' }));

    await user.click(
      screen.getByRole('menuitem', { name: 'Relaunch failed hosts' })
    );
    expect(handleRelaunch).toHaveBeenCalledWith({ hosts: 'failed' });

    await user.click(
      screen.getByRole('menuitem', { name: 'Relaunch all hosts' })
    );
    expect(handleRelaunch).toHaveBeenCalledWith({ hosts: 'all' });
  });
});
