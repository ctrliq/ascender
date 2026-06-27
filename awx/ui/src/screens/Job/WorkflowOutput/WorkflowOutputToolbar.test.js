import React from 'react';
import { act } from '@testing-library/react';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import WorkflowOutputToolbar from './WorkflowOutputToolbar';

const dispatch = jest.fn();
const job = {
  id: 1,
  name: 'Workflow Job',
  status: 'running',
  summary_fields: {
    workflow_job_template: {
      id: 7,
      name: 'Workflow Job Template',
    },
    user_capabilities: {
      start: true,
      delete: true,
    },
  },
};
const workflowContext = {
  nodes: [],
  showLegend: false,
  showTools: false,
};

function renderToolbar(jobOverride, contextOverride, onDelete) {
  return renderWithContexts(
    <WorkflowDispatchContext.Provider value={dispatch}>
      <WorkflowStateContext.Provider
        value={{ ...workflowContext, ...contextOverride }}
      >
        <WorkflowOutputToolbar
          job={jobOverride || job}
          onDelete={onDelete || (() => {})}
        />
      </WorkflowStateContext.Provider>
    </WorkflowDispatchContext.Provider>
  );
}

const byOuia = (id) => document.querySelector(`[data-ouia-component-id="${id}"]`);

const nodes = [{ id: 1 }, { id: 2 }, { id: 3, isDeleted: true }];

afterEach(() => {
  jest.clearAllMocks();
});

describe('WorkflowOutputToolbar', () => {
  test('should render correct toolbar item', () => {
    renderToolbar(job, { nodes });
    expect(byOuia('edit-workflow')).toBeInTheDocument();
    expect(
      document.querySelector('#workflow-output-toggle-legend')
    ).toBeInTheDocument();
    expect(
      document.querySelector('#workflow-elapsed-badge')
    ).toBeInTheDocument();
    expect(
      document.querySelector('#workflow-output-toggle-tools')
    ).toBeInTheDocument();
    expect(byOuia('cancel-job-button')).toBeInTheDocument();
    // a runnable (non-failed) workflow shows a plain relaunch button
    expect(byOuia('workflow-output-relaunch-button')).toBeInTheDocument();
  });

  test('failed workflow shows the relaunch-from-failed dropdown', () => {
    renderToolbar({ ...job, status: 'failed' }, { nodes: [{ id: 1 }] });
    expect(byOuia('relaunch-workflow-toggle')).toBeInTheDocument();
    expect(byOuia('workflow-output-relaunch-button')).not.toBeInTheDocument();
  });

  ['error', 'canceled'].forEach((status) => {
    test(`${status} workflow also shows the relaunch-from-failed dropdown`, () => {
      renderToolbar({ ...job, status }, { nodes: [{ id: 1 }] });
      expect(byOuia('relaunch-workflow-toggle')).toBeInTheDocument();
      expect(byOuia('workflow-output-relaunch-button')).not.toBeInTheDocument();
    });
  });

  test('shows a delete button when the workflow is finished and deletable', () => {
    renderToolbar(
      { ...job, status: 'successful' },
      { nodes: [{ id: 1 }] },
      () => {}
    );
    expect(byOuia('workflow-output-delete-button')).toBeInTheDocument();
  });

  test('Shows correct number of nodes', () => {
    renderToolbar(job, { nodes });
    // The start node (id=1) and deleted nodes (isDeleted=true) are ignored,
    // leaving 1; the elapsed badge has a distinct id.
    const badges = Array.from(
      document.querySelectorAll('.pf-v6-c-badge')
    ).filter((b) => b.id !== 'workflow-elapsed-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent('1');
  });

  test('Toggle Legend button dispatches as expected', async () => {
    const { user } = renderToolbar(job, { nodes });
    await user.click(document.querySelector('#workflow-output-toggle-legend'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_LEGEND' });
  });

  test('Toggle Tools button dispatches as expected', async () => {
    const { user } = renderToolbar(job, { nodes });
    await user.click(document.querySelector('#workflow-output-toggle-tools'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_TOOLS' });
  });

  test('does not render the visualizer button when no workflow template exists', () => {
    const slicedJob = {
      ...job,
      summary_fields: {
        ...job.summary_fields,
        workflow_job_template: null,
      },
    };
    renderToolbar(slicedJob, { nodes });
    expect(byOuia('edit-workflow')).not.toBeInTheDocument();
  });

  describe('elapsed timer', () => {
    beforeEach(() => {
      jest.useFakeTimers('modern');
      jest.setSystemTime(new Date('2021-09-01T12:30:45.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const elapsedText = () =>
      document.querySelector('#workflow-elapsed-badge').textContent;

    test('should show live elapsed time while running', () => {
      renderToolbar({
        ...job,
        started: '2021-09-01T12:30:40.000Z',
        finished: null,
      });
      expect(elapsedText()).toBe('00:00:05');
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(elapsedText()).toBe('00:00:07');
    });

    test('should keep the live value while finished is set but elapsed has not arrived yet', () => {
      renderToolbar({
        ...job,
        status: 'successful',
        started: '2021-09-01T12:30:40.000Z',
        finished: '2021-09-01T12:30:45.000Z',
        elapsed: undefined,
      });
      expect(elapsedText()).toBe('00:00:05');
    });

    test('should show final elapsed time once finished', () => {
      renderToolbar({
        ...job,
        status: 'successful',
        started: '2021-09-01T11:00:00.000Z',
        finished: '2021-09-01T12:01:01.000Z',
        elapsed: 3661,
      });
      expect(elapsedText()).toBe('01:01:01');
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(elapsedText()).toBe('01:01:01');
    });
  });
});
