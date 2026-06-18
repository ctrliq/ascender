import React from 'react';
import { screen } from '@testing-library/react';
import { ProjectsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import ProjectsListItem from './ProjectListItem';

jest.mock('../../../api/models/Projects');
jest.mock('hooks/useBrandName', () => ({
  __esModule: true,
  default: () => ({
    current: 'AWX',
  }),
}));

function renderItem(props) {
  return renderWithContexts(
    <table>
      <tbody>
        <ProjectsListItem
          isSelected={false}
          detailUrl="/project/1"
          onSelect={() => {}}
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
  summary_fields: {
    last_job: {
      id: 9000,
      status: 'successful',
    },
    user_capabilities: {},
  },
};

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
    ProjectsAPI.copy.mockResolvedValue();
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
    ProjectsAPI.copy.mockRejectedValue(new Error('This is an error'));
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
    expect(
      screen.getByText('Failed to copy project.')
    ).toBeInTheDocument();
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

  test('should indicate that the revision needs to be refreshed when project sync is done', () => {
    renderItem({
      project: {
        ...baseProject,
        scm_revision: null,
        summary_fields: {
          current_job: {
            id: 9001,
            status: 'successful',
            finished: '2021-06-01T18:43:53.332201Z',
          },
          last_job: {
            id: 9000,
            status: 'successful',
          },
          user_capabilities: { edit: true },
        },
      },
    });
    const revisionCell = document.querySelector('td[data-label="Revision"]');
    expect(revisionCell).toHaveTextContent('Refresh for revision');
    // the UndoIcon refresh button has no aria-label; query by its ouiaId
    expect(
      document.querySelector(
        '[data-ouia-component-id="project-refresh-revision-1"]'
      )
    ).toBeInTheDocument();
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
    expect(screen.getByText('Last modified')).toBeInTheDocument();
    expect(screen.getByText('Last used')).toBeInTheDocument();
  });
});

afterEach(() => {
  jest.clearAllMocks();
});
