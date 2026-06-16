import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import {
  ProjectsAPI,
  JobTemplatesAPI,
  WorkflowJobTemplatesAPI,
  InventorySourcesAPI,
} from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import ProjectList from './ProjectList';

jest.mock('../../../api');

const mockProjects = [
  {
    id: 1,
    name: 'Project 1',
    url: '/api/v2/projects/1',
    type: 'project',
    scm_type: 'git',
    scm_revision: 'hfadsh89sa9gsaisdf0jogos0fgd9sgdf89adsf98',
    summary_fields: {
      last_job: {
        id: 9000,
        status: 'successful',
      },
      user_capabilities: {
        delete: true,
        update: true,
      },
    },
  },
  {
    id: 2,
    name: 'Project 2',
    url: '/api/v2/projects/2',
    type: 'project',
    scm_type: 'svn',
    scm_revision: '7788f7erga0jijodfgsjisiodf98sdga9hg9a98gaf',
    summary_fields: {
      last_job: {
        id: 9002,
        status: 'successful',
      },
      user_capabilities: {
        delete: true,
        update: true,
      },
    },
  },
  {
    id: 3,
    name: 'Project 3',
    url: '/api/v2/projects/3',
    type: 'project',
    scm_type: 'insights',
    scm_revision: '4893adfi749493afjksjoaiosdgjoaisdjadfisjaso',
    summary_fields: {
      last_job: {
        id: 9003,
        status: 'successful',
      },
      user_capabilities: {
        delete: false,
        update: false,
      },
    },
  },
  {
    id: 4,
    name: 'Project 4',
    url: '/api/v2/projects/4',
    type: 'project',
    scm_type: 'archive',
    scm_revision: 'odsd9ajf8aagjisooajfij34ikdj3fs994s4daiaos7',
    summary_fields: {
      last_job: {
        id: 9004,
        status: 'successful',
      },
      user_capabilities: {
        delete: false,
        update: false,
      },
    },
  },
];

function getRowCheckbox(name) {
  const row = screen.getByRole('link', { name }).closest('tr');
  return within(row).getByRole('checkbox');
}

describe('<ProjectList />', () => {
  beforeEach(() => {
    JobTemplatesAPI.read.mockResolvedValue({ data: { count: 0 } });
    WorkflowJobTemplatesAPI.read.mockResolvedValue({ data: { count: 0 } });
    InventorySourcesAPI.read.mockResolvedValue({ data: { count: 0 } });
    ProjectsAPI.read.mockResolvedValue({
      data: {
        count: mockProjects.length,
        results: mockProjects,
      },
    });

    ProjectsAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should load and render projects', async () => {
    renderWithContexts(<ProjectList />);

    expect(await screen.findByRole('link', { name: 'Project 1' })).toBeInTheDocument();
    mockProjects.forEach((p) =>
      expect(screen.getByRole('link', { name: p.name })).toBeInTheDocument()
    );
  });

  test('should select project when checked', async () => {
    const { user } = renderWithContexts(<ProjectList />);
    await screen.findByRole('link', { name: 'Project 1' });

    const checkbox = getRowCheckbox('Project 1');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  test('should select all', async () => {
    const { user } = renderWithContexts(<ProjectList />);
    await screen.findByRole('link', { name: 'Project 1' });

    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    const rowCheckboxes = screen
      .getAllByRole('checkbox')
      .filter((box) => box !== selectAll);
    expect(rowCheckboxes).toHaveLength(4);

    await user.click(selectAll);
    rowCheckboxes.forEach((box) => expect(box).toBeChecked());
  });

  test('should disable delete button when a non-deletable project is selected', async () => {
    const { user } = renderWithContexts(<ProjectList />);
    await screen.findByRole('link', { name: 'Project 3' });

    await user.click(getRowCheckbox('Project 3'));

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test('should call delete api and query related-resource delete details', async () => {
    ProjectsAPI.destroy.mockResolvedValue({});
    const { user } = renderWithContexts(<ProjectList />);
    await screen.findByRole('link', { name: 'Project 1' });

    await user.click(getRowCheckbox('Project 1'));
    await user.click(getRowCheckbox('Project 2'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() => expect(ProjectsAPI.destroy).toHaveBeenCalledTimes(2));
  });

  test('single-project delete confirmation fires the 3 related-resource requests', async () => {
    ProjectsAPI.destroy.mockResolvedValue({});
    const { user } = renderWithContexts(<ProjectList />);
    await screen.findByRole('link', { name: 'Project 1' });

    await user.click(getRowCheckbox('Project 1'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    // opening the confirmation for a single item queries the related resources
    // (JobTemplates, WorkflowJobTemplates, InventorySources) that block delete
    await screen.findByRole('button', { name: 'confirm delete' });
    await waitFor(() => {
      expect(JobTemplatesAPI.read).toHaveBeenCalled();
      expect(WorkflowJobTemplatesAPI.read).toHaveBeenCalled();
      expect(InventorySourcesAPI.read).toHaveBeenCalled();
    });
  });

  test('should show deletion error', async () => {
    ProjectsAPI.destroy.mockRejectedValue(
      new Error({
        response: {
          config: {
            method: 'delete',
            url: '/api/v2/projects/1',
          },
          data: 'An error occurred',
        },
      })
    );
    const { user } = renderWithContexts(<ProjectList />);
    await screen.findByRole('link', { name: 'Project 1' });
    expect(ProjectsAPI.read).toHaveBeenCalledTimes(1);

    await user.click(getRowCheckbox('Project 1'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    expect(await screen.findByText('Error!')).toBeInTheDocument();
  });

  test('Add button shown for users with ability to POST', async () => {
    renderWithContexts(<ProjectList />);
    await screen.findByRole('link', { name: 'Project 1' });

    expect(screen.getByRole('link', { name: 'Add' })).toBeInTheDocument();
  });

  test('Add button hidden for users without ability to POST', async () => {
    ProjectsAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
        },
        related_search_fields: [],
      },
    });
    renderWithContexts(<ProjectList />);
    await screen.findByRole('link', { name: 'Project 1' });

    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
  });
});
