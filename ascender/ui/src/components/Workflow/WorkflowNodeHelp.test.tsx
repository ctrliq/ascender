import React from 'react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import WorkflowNodeHelp from './WorkflowNodeHelp';
import type { WorkflowNode } from './workflowReducer';

const node = {
  originalNodeObject: {
    identifier: 'Foo',
    summary_fields: {
      job: {
        name: 'Foo Job Template',
        elapsed: 9000,
        status: 'successful',
        type: 'job',
      },
      unified_job_template: {
        name: 'Foo Job Template',
        type: 'job_template',
      },
    },
  },
  unifiedJobTemplate: {
    name: 'Foo Job Template',
    unified_job_type: 'job',
  },
};

describe('WorkflowNodeHelp', () => {
  test('renders the expected content for a completed job template job', () => {
    const { container } = renderWithContexts(
      <WorkflowNodeHelp node={node as unknown as WorkflowNode} />
    );
    expect(
      container.querySelector('#workflow-node-help-alias')
    ).toHaveTextContent('Foo');
    expect(
      container.querySelector('#workflow-node-help-name')
    ).toHaveTextContent('Foo Job Template');
    expect(
      container.querySelector('#workflow-node-help-type')
    ).toHaveTextContent('Job Template');
    expect(
      container.querySelector('#workflow-node-help-status')
    ).toHaveTextContent('Successful');
    expect(
      container.querySelector('#workflow-node-help-elapsed')
    ).toHaveTextContent('02:30:00');
  });

  test('notes a deleted resource without leaking the job to the DOM', () => {
    // no unifiedJobTemplate anywhere on the node: the resource is gone
    const deletedNode = {
      originalNodeObject: {
        identifier: 'Gone',
        summary_fields: {
          job: {
            name: 'Gone Job',
            elapsed: 4,
            status: 'successful',
            type: 'job',
          },
        },
      },
    };
    const { getByText } = renderWithContexts(
      <WorkflowNodeHelp node={deletedNode as unknown as WorkflowNode} />
    );
    const notice = getByText(
      'The resource associated with this node has been deleted.'
    ).closest('p');
    expect(notice).toBeInTheDocument();
    // the job only decides the margin below the notice; it must not reach the
    // element as an attribute
    expect(notice).not.toHaveAttribute('job');
  });

  test('says who forced a node as successful and why', () => {
    const forcedNode = {
      originalNodeObject: {
        prior_run_succeeded: true,
        forced_success: true,
        forced_success_reason: 'confluence is down, patching went fine',
        summary_fields: {
          unified_job_template: {
            name: 'Update Confluence',
            type: 'job_template',
          },
          forced_success_by: { id: 1, username: 'fernando' },
          forced_success_job: { id: 4242, status: 'failed' },
        },
      },
    };
    const { container } = renderWithContexts(
      <WorkflowNodeHelp node={forcedNode as unknown as WorkflowNode} />
    );
    expect(
      container.querySelector('#workflow-node-help-status')
    ).toHaveTextContent('Failed, forced as successful');
    expect(
      container.querySelector('#workflow-node-help-forced-by')
    ).toHaveTextContent('fernando');
    expect(
      container.querySelector('#workflow-node-help-forced-reason')
    ).toHaveTextContent('confluence is down, patching went fine');
  });

  test('keeps who forced a node and why when its template was deleted', () => {
    const forcedNode = {
      originalNodeObject: {
        prior_run_succeeded: true,
        forced_success: true,
        forced_success_reason: 'confluence is down',
        summary_fields: {
          forced_success_by: { id: 1, username: 'fernando' },
        },
      },
    };
    const { container, queryByText } = renderWithContexts(
      <WorkflowNodeHelp node={forcedNode as unknown as WorkflowNode} />
    );
    expect(
      queryByText('The resource associated with this node has been deleted.')
    ).toBeInTheDocument();
    expect(
      container.querySelector('#workflow-node-help-forced-by')
    ).toHaveTextContent('fernando');
    expect(
      container.querySelector('#workflow-node-help-forced-reason')
    ).toHaveTextContent('confluence is down');
    // the failed job is gone too, so there is nothing to click through to
    expect(
      queryByText('Click to view the job that failed')
    ).not.toBeInTheDocument();
  });
});
