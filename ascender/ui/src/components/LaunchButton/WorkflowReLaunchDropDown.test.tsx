import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { WorkflowJobsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import WorkflowReLaunchDropDown from './WorkflowReLaunchDropDown';

vi.mock('../../api');

describe('WorkflowReLaunchDropDown', () => {
  test('renders a dropdown toggle', () => {
    renderWithContexts(<WorkflowReLaunchDropDown handleRelaunch={() => {}} />);
    expect(
      screen.getByRole('button', { name: 'relaunch workflow' })
    ).toBeInTheDocument();
  });

  test('offers "First Node" and "Failed node" with the right relaunch params', async () => {
    const handleRelaunch = vi.fn();
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
    const handleRelaunch = vi.fn();
    const { user } = renderWithContexts(
      <WorkflowReLaunchDropDown
        handleRelaunch={handleRelaunch}
        status="canceled"
      />
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

  test('offers the new-variables option only when the template allows it', async () => {
    const { user } = renderWithContexts(
      <WorkflowReLaunchDropDown handleRelaunch={() => {}} jobId={7} />
    );

    await user.click(screen.getByRole('button', { name: 'relaunch workflow' }));
    expect(
      screen.queryByRole('menuitem', {
        name: 'Relaunch from failed node with new variables',
      })
    ).not.toBeInTheDocument();
  });

  test('offers forcing nodes only when the template allows it', async () => {
    const { user } = renderWithContexts(
      <WorkflowReLaunchDropDown handleRelaunch={() => {}} jobId={7} />
    );

    await user.click(screen.getByRole('button', { name: 'relaunch workflow' }));
    expect(
      screen.queryByRole('menuitem', {
        name: 'Relaunch forcing failed nodes as successful',
      })
    ).not.toBeInTheDocument();
  });

  test('relaunches from failed forcing the nodes the modal collected', async () => {
    vi.mocked(WorkflowJobsAPI.readNodes).mockResolvedValue({
      data: {
        count: 1,
        results: [
          {
            id: 31,
            identifier: 'update-confluence',
            summary_fields: { job: { status: 'failed', type: 'job' } },
          },
        ],
      },
    } as unknown as ResponseOf<typeof WorkflowJobsAPI.readNodes>);
    const handleRelaunch = vi.fn();
    const { user } = renderWithContexts(
      <WorkflowReLaunchDropDown
        handleRelaunch={handleRelaunch}
        canForceSuccess
        jobId={7}
      />
    );

    await user.click(screen.getByRole('button', { name: 'relaunch workflow' }));
    await user.click(
      screen.getByRole('menuitem', {
        name: 'Relaunch forcing failed nodes as successful',
      })
    );
    await user.type(
      await screen.findByRole('textbox', { name: 'Reason' }),
      'confluence is down'
    );
    await user.click(screen.getByRole('button', { name: 'Relaunch' }));
    expect(handleRelaunch).toHaveBeenCalledWith({
      nodes: 'failed',
      force_success_nodes: [31],
      force_success_reason: 'confluence is down',
    });
  });

  test('relaunches from failed with the variables the modal collected', async () => {
    vi.mocked(WorkflowJobsAPI.readDetail).mockResolvedValue({
      data: { extra_vars: '{"colour": "red"}' },
    } as unknown as ResponseOf<typeof WorkflowJobsAPI.readDetail>);
    const handleRelaunch = vi.fn();
    const { user } = renderWithContexts(
      <WorkflowReLaunchDropDown
        handleRelaunch={handleRelaunch}
        canOverwriteVars
        jobId={7}
      />
    );

    await user.click(screen.getByRole('button', { name: 'relaunch workflow' }));
    await user.click(
      screen.getByRole('menuitem', {
        name: 'Relaunch from failed node with new variables',
      })
    );

    // the modal opens on the variables the run used, which are relaunched as
    // they are when nothing is edited
    await waitFor(() =>
      expect(WorkflowJobsAPI.readDetail).toHaveBeenCalledWith(7)
    );
    await waitFor(() =>
      expect(
        (document.querySelector('.cm-content') as HTMLElement)?.textContent
      ).toBe('colour: red')
    );

    await user.click(screen.getByRole('button', { name: 'Relaunch' }));
    expect(handleRelaunch).toHaveBeenCalledWith({
      nodes: 'failed',
      extra_vars: { colour: 'red' },
    });
  });
});
