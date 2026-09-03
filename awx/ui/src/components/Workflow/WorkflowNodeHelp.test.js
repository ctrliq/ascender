import React from 'react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import WorkflowNodeHelp from './WorkflowNodeHelp';

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
    const { container } = renderWithContexts(<WorkflowNodeHelp node={node} />);
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
      <WorkflowNodeHelp node={deletedNode} />
    );
    const notice = getByText(
      'The resource associated with this node has been deleted.'
    ).closest('p');
    expect(notice).toBeInTheDocument();
    // the job only decides the margin below the notice; it must not reach the
    // element as an attribute
    expect(notice).not.toHaveAttribute('job');
  });
});
