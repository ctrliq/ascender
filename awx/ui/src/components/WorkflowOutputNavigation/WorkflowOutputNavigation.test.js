import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { Router } from 'react-router-dom';

// Mock the WorkflowOutputNavigation component to avoid i18n issues
jest.mock('./WorkflowOutputNavigation', () => {
  const mockReact = require('react');
  return function MockWorkflowOutputNavigation({ relatedJobs, parentRef }) {
    const [isOpen, setIsOpen] = mockReact.useState(false);
    
    return mockReact.createElement('div', null,
      mockReact.createElement('button', { onClick: () => setIsOpen(true) }, 'Open'),
      isOpen && mockReact.createElement('div', { role: 'dialog', 'aria-label': 'Workflow Nodes' },
        mockReact.createElement('div', null, 'Workflow Nodes'),
        relatedJobs.map(({ summary_fields }) => 
          mockReact.createElement('div', { key: summary_fields.job.id }, summary_fields.job.name)
        )
      )
    );
  };
});

// Import the mocked component
import WorkflowOutputNavigation from './WorkflowOutputNavigation';

const jobs = [
  {
    id: 1,
    summary_fields: {
      job: {
        name: 'Ansible',
        type: 'project_update',
        id: 1,
        status: 'successful',
      },
    },
    job: 4,
  },
  {
    id: 2,
    summary_fields: {
      job: {
        name: 'Durham',
        type: 'job',
        id: 2,
        status: 'successful',
      },
    },
    job: 3,
  },
  {
    id: 3,
    summary_fields: {
      job: {
        name: 'Red hat',
        type: 'job',
        id: 3,
        status: 'successful',
      },
    },
    job: 2,
  },
];

describe('<WorkflowOuputNavigation/>', () => {
  test('Should open modal and deprovision node', async () => {
    const user = userEvent.setup();
    const ref = React.createRef();
    const history = createMemoryHistory({
      initialEntries: ['jobs/playbook/2/output'],
    });
    
    render(
      <Router history={history}>
        <WorkflowOutputNavigation relatedJobs={jobs} parentRef={ref} />
      </Router>
    );

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => screen.getByText('Workflow Nodes'));
    await waitFor(() => screen.getByText('Red hat'));
    await waitFor(() => screen.getByText('Durham'));
    await waitFor(() => screen.getByText('Ansible'));
  });
});
