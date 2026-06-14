import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import WorkflowReLaunchDropDown from './WorkflowReLaunchDropDown';

describe('WorkflowReLaunchDropDown', () => {
  test('renders a dropdown toggle', () => {
    renderWithContexts(
      <WorkflowReLaunchDropDown handleRelaunch={() => {}} />
    );
    expect(
      screen.getByRole('button', { name: 'relaunch workflow' })
    ).toBeInTheDocument();
  });

  test('offers "First Node" and "Failed node" with the right relaunch params', async () => {
    const handleRelaunch = jest.fn();
    const { user } = renderWithContexts(
      <WorkflowReLaunchDropDown handleRelaunch={handleRelaunch} />
    );

    await user.click(screen.getByRole('button', { name: 'relaunch workflow' }));

    // the menu stays open after a selection, so both items are reachable
    await user.click(
      screen.getByRole('menuitem', { name: 'Relaunch from failed node' })
    );
    expect(handleRelaunch).toHaveBeenCalledWith({ nodes: 'failed' });

    await user.click(
      screen.getByRole('menuitem', { name: 'Relaunch from first node' })
    );
    expect(handleRelaunch).toHaveBeenCalledWith({});
  });

  test('labels the option "Canceled node" when the workflow was canceled', async () => {
    const handleRelaunch = jest.fn();
    const { user } = renderWithContexts(
      <WorkflowReLaunchDropDown handleRelaunch={handleRelaunch} status="canceled" />
    );

    await user.click(screen.getByRole('button', { name: 'relaunch workflow' }));

    const canceledItem = screen.getByRole('menuitem', {
      name: 'Relaunch from canceled node',
    });
    expect(canceledItem).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Relaunch from failed node' })
    ).not.toBeInTheDocument();

    await user.click(canceledItem);
    // same carry-forward param regardless of wording
    expect(handleRelaunch).toHaveBeenCalledWith({ nodes: 'failed' });
  });
});
