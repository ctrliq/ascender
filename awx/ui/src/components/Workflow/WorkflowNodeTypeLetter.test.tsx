import React from 'react';
import { render } from '@testing-library/react';
import WorkflowNodeTypeLetter from './WorkflowNodeTypeLetter';
import type { WorkflowNode } from './workflowReducer';

describe('WorkflowNodeTypeLetter', () => {
  test('renders JT when type=job_template', () => {
    const { container } = render(
      <svg>
        <WorkflowNodeTypeLetter
          node={
            {
              fullUnifiedJobTemplate: { type: 'job_template' },
            } as unknown as WorkflowNode
          }
        />
      </svg>
    );
    expect(container.querySelector('foreignObject')).toHaveTextContent('JT');
  });
  test('renders JT when unified_job_type=job', () => {
    const { container } = render(
      <svg>
        <WorkflowNodeTypeLetter
          node={
            {
              fullUnifiedJobTemplate: { unified_job_type: 'job' },
            } as unknown as WorkflowNode
          }
        />
      </svg>
    );
    expect(container.querySelector('foreignObject')).toHaveTextContent('JT');
  });
  test('renders P when type=project', () => {
    const { container } = render(
      <svg>
        <WorkflowNodeTypeLetter
          node={
            {
              fullUnifiedJobTemplate: { type: 'project' },
            } as unknown as WorkflowNode
          }
        />
      </svg>
    );
    expect(container.querySelector('foreignObject')).toHaveTextContent('P');
  });
  test('renders P when unified_job_type=project_update', () => {
    const { container } = render(
      <svg>
        <WorkflowNodeTypeLetter
          node={
            {
              fullUnifiedJobTemplate: { unified_job_type: 'project_update' },
            } as unknown as WorkflowNode
          }
        />
      </svg>
    );
    expect(container.querySelector('foreignObject')).toHaveTextContent('P');
  });
  test('renders I when type=inventory_source', () => {
    const { container } = render(
      <svg>
        <WorkflowNodeTypeLetter
          node={
            {
              fullUnifiedJobTemplate: { type: 'inventory_source' },
            } as unknown as WorkflowNode
          }
        />
      </svg>
    );
    expect(container.querySelector('foreignObject')).toHaveTextContent('I');
  });
  test('renders I when unified_job_type=inventory_update', () => {
    const { container } = render(
      <svg>
        <WorkflowNodeTypeLetter
          node={
            {
              fullUnifiedJobTemplate: { unified_job_type: 'inventory_update' },
            } as unknown as WorkflowNode
          }
        />
      </svg>
    );
    expect(container.querySelector('foreignObject')).toHaveTextContent('I');
  });
  test('renders W when type=workflow_job_template', () => {
    const { container } = render(
      <svg>
        <WorkflowNodeTypeLetter
          node={
            {
              fullUnifiedJobTemplate: { type: 'workflow_job_template' },
            } as unknown as WorkflowNode
          }
        />
      </svg>
    );
    expect(container.querySelector('foreignObject')).toHaveTextContent('W');
  });
  test('renders W when unified_job_type=workflow_job', () => {
    const { container } = render(
      <svg>
        <WorkflowNodeTypeLetter
          node={
            {
              fullUnifiedJobTemplate: { unified_job_type: 'workflow_job' },
            } as unknown as WorkflowNode
          }
        />
      </svg>
    );
    expect(container.querySelector('foreignObject')).toHaveTextContent('W');
  });
  test('renders pause icon when type=workflow_approval_template', () => {
    const { container } = render(
      <svg>
        <WorkflowNodeTypeLetter
          node={
            {
              fullUnifiedJobTemplate: { type: 'workflow_approval_template' },
            } as unknown as WorkflowNode
          }
        />
      </svg>
    );
    // the pause icon is an <svg> rendered inside the component's foreignObject;
    // the outer wrapper <svg> would match either way, so scope to foreignObject
    expect(container.querySelector('foreignObject svg')).toBeInTheDocument();
  });
  test('renders pause icon when unified_job_type=workflow_approval', () => {
    const { container } = render(
      <svg>
        <WorkflowNodeTypeLetter
          node={
            {
              fullUnifiedJobTemplate: { unified_job_type: 'workflow_approval' },
            } as unknown as WorkflowNode
          }
        />
      </svg>
    );
    // the pause icon is an <svg> rendered inside the component's foreignObject;
    // the outer wrapper <svg> would match either way, so scope to foreignObject
    expect(container.querySelector('foreignObject svg')).toBeInTheDocument();
  });
});
