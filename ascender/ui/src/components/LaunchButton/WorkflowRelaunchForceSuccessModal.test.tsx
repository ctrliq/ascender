import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { WorkflowJobsAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import WorkflowRelaunchForceSuccessModal from './WorkflowRelaunchForceSuccessModal';

vi.mock('../../api');

const failedNode = (id: number, identifier: string, type = 'job') => ({
  id,
  identifier,
  summary_fields: {
    job: { status: 'failed', type },
    unified_job_template: { name: `${identifier} template` },
  },
});

const readNodes = (results: unknown[]) =>
  vi.mocked(WorkflowJobsAPI.readNodes).mockResolvedValue({
    data: { count: results.length, results },
  } as unknown as ResponseOf<typeof WorkflowJobsAPI.readNodes>);

describe('WorkflowRelaunchForceSuccessModal', () => {
  test('asks only for the nodes of the run that failed', async () => {
    readNodes([failedNode(31, 'confluence')]);
    renderWithContexts(
      <WorkflowRelaunchForceSuccessModal
        jobId={7}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    await waitFor(() =>
      expect(WorkflowJobsAPI.readNodes).toHaveBeenCalledWith(7, {
        job__status__in: 'failed,error,canceled',
        page_size: 200,
        order_by: 'id',
      })
    );
  });

  test('needs a reason before it relaunches, and ticks a lone node itself', async () => {
    readNodes([failedNode(31, 'confluence')]);
    const onConfirm = vi.fn();
    const { user } = renderWithContexts(
      <WorkflowRelaunchForceSuccessModal
        jobId={7}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );

    const checkbox = await screen.findByRole('checkbox', {
      name: 'confluence (confluence template)',
    });
    expect(checkbox).toBeChecked();
    const relaunch = screen.getByRole('button', { name: 'Relaunch' });
    expect(relaunch).toBeDisabled();

    // blanks do not count as a reason
    await user.type(screen.getByRole('textbox', { name: 'Reason' }), '   ');
    expect(relaunch).toBeDisabled();

    await user.type(
      screen.getByRole('textbox', { name: 'Reason' }),
      'confluence is down '
    );
    await user.click(relaunch);
    expect(onConfirm).toHaveBeenCalledWith({
      nodes: [31],
      reason: 'confluence is down',
    });
  });

  test('lets several failed nodes be picked, and leaves approvals out', async () => {
    readNodes([
      failedNode(31, 'confluence'),
      failedNode(32, 'notify'),
      failedNode(33, 'change-approval', 'workflow_approval'),
    ]);
    const onConfirm = vi.fn();
    const { user } = renderWithContexts(
      <WorkflowRelaunchForceSuccessModal
        jobId={7}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );

    const confluence = await screen.findByRole('checkbox', {
      name: 'confluence (confluence template)',
    });
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    // with more than one to choose from, nothing is ticked for you
    expect(confluence).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Relaunch' })).toBeDisabled();

    await user.click(confluence);
    await user.click(
      screen.getByRole('checkbox', { name: 'notify (notify template)' })
    );
    await user.type(screen.getByRole('textbox', { name: 'Reason' }), 'why');
    await user.click(screen.getByRole('button', { name: 'Relaunch' }));
    expect(onConfirm).toHaveBeenCalledWith({ nodes: [31, 32], reason: 'why' });
  });

  test('says so when there is nothing that can be forced', async () => {
    readNodes([failedNode(33, 'change-approval', 'workflow_approval')]);
    renderWithContexts(
      <WorkflowRelaunchForceSuccessModal
        jobId={7}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(
      await screen.findByText(/no failed nodes that can be forced/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Relaunch' })).toBeDisabled();
  });
});
