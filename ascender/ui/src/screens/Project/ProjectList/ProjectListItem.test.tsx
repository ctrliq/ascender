import type { Project } from 'types/api';
import React from 'react';
import { screen } from '@testing-library/react';
import { ProjectsAPI } from 'api';
import type { ApiResponse } from 'api/Base';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import ProjectsListItem from './ProjectListItem';

vi.mock('../../../api/models/Projects');
vi.mock('hooks/useBrandName', () => ({
  __esModule: true,
  default: () => ({
    current: 'Ascender Automation',
  }),
}));

function renderItem(
  props: Partial<React.ComponentProps<typeof ProjectsListItem>>
) {
  return renderWithContexts(
    <table>
      <tbody>
        <ProjectsListItem
          isSelected={false}
          isExpanded={false}
          onExpand={() => {}}
          detailUrl="/project/1"
          onSelect={() => {}}
          onCopy={() => {}}
          fetchProjects={() => {}}
          rowIndex={0}
          project={baseProject}
          {...props}
        />
      </tbody>
    </table>
  );
}

const baseProject = {
  id: 1,
  name: 'Project 1',
  url: '/api/v2/projects/1',
  type: 'project',
  scm_type: 'git',
  scm_revision: '7788f7erga0jijodfgsjisiodf98sdga9hg9a98gaf',
  modified: '2019-10-10T01:15:07.126487Z',
  last_job_run: '2019-10-10T01:15:32.428068Z',
  summary_fields: {
    last_job: {
      id: 9000,
      status: 'successful',
    },
    user_capabilities: {},
  },
} as unknown as Project;

describe('<ProjectsListItem />', () => {
  test('launch button shown to users with start capabilities', () => {
    renderItem({
      project: {
        ...baseProject,
        summary_fields: {
          ...baseProject.summary_fields,
          user_capabilities: { start: true },
        },
      },
    });
    expect(
      screen.getByRole('button', { name: 'Sync Project' })
    ).toBeInTheDocument();
  });

  test('launch button hidden from users without start capabilities', () => {
    renderItem({
      project: {
        ...baseProject,
        summary_fields: {
          ...baseProject.summary_fields,
          user_capabilities: { start: false },
        },
      },
    });
    expect(
      screen.queryByRole('button', { name: 'Sync Project' })
    ).not.toBeInTheDocument();
  });

  // A new sync has not reached a node yet, and the api still lets it go.
  test('cancel button shown for a sync not yet started', () => {
    renderItem({
      project: {
        ...baseProject,
        summary_fields: {
          current_job: { id: 9001, status: 'new', finished: null },
          user_capabilities: { start: true, edit: true },
        },
      } as unknown as Project,
    });
    expect(
      screen.getByRole('button', { name: 'Cancel Project Sync' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sync Project' })
    ).not.toBeInTheDocument();
  });

  test('edit button shown to users with edit capabilities', () => {
    renderItem({
      project: {
        ...baseProject,
        summary_fields: {
          ...baseProject.summary_fields,
          user_capabilities: { edit: true },
        },
      },
    });
    expect(
      screen.getByRole('link', { name: 'Edit Project' })
    ).toBeInTheDocument();
  });

  test('edit button hidden from users without edit capabilities', () => {
    renderItem({
      project: {
        ...baseProject,
        summary_fields: {
          ...baseProject.summary_fields,
          user_capabilities: { edit: false },
        },
      },
    });
    expect(
      screen.queryByRole('link', { name: 'Edit Project' })
    ).not.toBeInTheDocument();
  });

  test('should call api to copy project', async () => {
    vi.mocked(ProjectsAPI.copy).mockResolvedValue(
      undefined as unknown as ApiResponse<unknown>
    );
    const { user } = renderItem({
      onCopy: () => {},
      fetchProjects: () => {},
      project: {
        ...baseProject,
        summary_fields: {
          ...baseProject.summary_fields,
          user_capabilities: { edit: false, copy: true },
        },
      },
    });

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(ProjectsAPI.copy).toHaveBeenCalled();
  });

  test('should render proper alert modal on copy error', async () => {
    vi.mocked(ProjectsAPI.copy).mockRejectedValue(
      new Error('This is an error')
    );
    const { user } = renderItem({
      onCopy: () => {},
      fetchProjects: () => {},
      project: {
        ...baseProject,
        summary_fields: {
          ...baseProject.summary_fields,
          user_capabilities: { edit: false, copy: true },
        },
      },
    });

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Error!')).toBeInTheDocument();
    expect(screen.getByText('Failed to copy project.')).toBeInTheDocument();
  });

  test('should not render copy button', () => {
    renderItem({
      detailUrl: '/foo/bar',
      project: {
        ...baseProject,
        summary_fields: {
          ...baseProject.summary_fields,
          user_capabilities: { edit: false, copy: false },
        },
      },
    });
    expect(
      screen.queryByRole('button', { name: 'Copy' })
    ).not.toBeInTheDocument();
  });

  test('should render proper revision text when project has not been synced', () => {
    renderItem({
      project: {
        ...baseProject,
        scm_revision: '',
        summary_fields: {
          ...baseProject.summary_fields,
          user_capabilities: { edit: true },
        },
      },
    });
    const revisionCell = document.querySelector('td[data-label="Revision"]');
    expect(revisionCell).toHaveTextContent('Sync for revision');
  });

  test('should render the clipboard copy with the right text when scm revision available', () => {
    renderItem({
      project: {
        ...baseProject,
        scm_revision: 'osofej904r09a9sf0udfsajogsdfbh4e23489adf',
        summary_fields: {
          ...baseProject.summary_fields,
          user_capabilities: { edit: true },
        },
      },
    });
    const revisionCell = document.querySelector('td[data-label="Revision"]');
    expect(revisionCell).toHaveTextContent('osofej9');
  });

  /*
   * The revision a running sync will write is not the one on the row, so the
   * row says a sync is running rather than showing a revision about to go.
   */
  test('should say syncing over a revision the sync is replacing', () => {
    renderItem({
      project: {
        ...baseProject,
        scm_revision: 'osofej904r09a9sf0udfsajogsdfbh4e23489adf',
        summary_fields: {
          current_job: { id: 9001, status: 'running', finished: null },
          user_capabilities: { edit: true },
        },
      },
    });
    const revisionCell = document.querySelector('td[data-label="Revision"]');
    expect(revisionCell).toHaveTextContent('Syncing');
    expect(revisionCell).not.toHaveTextContent('osofej9');
  });

  /*
   * Once the sync is over the row stops saying Syncing, whether or not the
   * read that brings its new revision has arrived. A sync that ends in an
   * error sends no finish time and brings no read, so waiting on one left the
   * row saying Syncing for good.
   */
  test('stops saying syncing once the sync is over', () => {
    renderItem({
      project: {
        ...baseProject,
        scm_revision: 'osofej904r09a9sf0udfsajogsdfbh4e23489adf',
        summary_fields: {
          current_job: { id: 9001, status: 'error' },
          last_job: {
            id: 9000,
            status: 'successful',
          },
          user_capabilities: { edit: true },
        },
      },
    });
    const revisionCell = document.querySelector('td[data-label="Revision"]');
    expect(revisionCell).not.toHaveTextContent('Syncing');
    expect(revisionCell).toHaveTextContent('osofej9');
  });

  test('should render expected details in expanded section', () => {
    renderItem({
      rowIndex: 1,
      isExpanded: true,
      project: {
        ...baseProject,
        description: 'Project 1 description',
        scm_revision: '123456789',
        summary_fields: {
          organization: {
            id: 999,
            description: '',
            name: 'Mock org',
          },
          last_job: {
            id: 9000,
            status: 'successful',
          },
          user_capabilities: { start: true },
          default_environment: {
            id: 123,
            name: 'Mock EE',
            image: 'mock.image',
          },
        },
        default_environment: 123,
        organization: 999,
      },
    });

    assertDetail('Description', 'Project 1 description');
    assertDetail('Organization', 'Mock org');
    assertDetail('Default Execution Environment', 'Mock EE');
    expect(screen.getByText('Last Modified')).toBeInTheDocument();
    expect(screen.getByText('Last Used')).toBeInTheDocument();
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
