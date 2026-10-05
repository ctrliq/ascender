import React from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import {
  CredentialTypesAPI,
  InventorySourcesAPI,
  OrganizationsAPI,
  ProjectsAPI,
  RootAPI,
  UnifiedJobsAPI,
} from 'api';
import mockOrganization from 'util/data.organization.json';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import mockDetails from './data.project.json';
import Project from './Project';

vi.mock('../../api');

const mockMe = {
  is_super_user: true,
  is_system_auditor: false,
};

async function getOrganizations() {
  return {
    count: 1,
    next: null,
    previous: null,
    data: {
      results: [mockOrganization],
    },
  };
}

// Mount under the same /projects/:id/* route that Projects.js gives it, so the
// nested v6 <Routes> resolve and useParams sees the id.
function renderProject(initialEntry = '/projects/1/details') {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const rendered = renderWithContexts(
    <Routes>
      <Route
        path="/projects/:id/*"
        element={<Project setBreadcrumb={() => {}} me={mockMe} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
  return { ...rendered, history };
}

describe('<Project />', () => {
  beforeEach(() => {
    vi.mocked(ProjectsAPI.readDetail).mockResolvedValue({
      data: mockDetails,
    } as unknown as ResponseOf<typeof ProjectsAPI.readDetail>);
    vi.mocked(ProjectsAPI.readOptions).mockResolvedValue({
      data: { actions: { GET: { scm_type: { choices: [['git', 'Git']] } } } },
    } as unknown as ResponseOf<typeof ProjectsAPI.readOptions>);
    vi.mocked(CredentialTypesAPI.read).mockResolvedValue({
      data: { results: [{ id: 4 }] },
    } as unknown as ResponseOf<typeof CredentialTypesAPI.read>);
    vi.mocked(OrganizationsAPI.read).mockImplementation(
      getOrganizations as unknown as typeof OrganizationsAPI.read
    );
    // the resolved detail route mounts components that read the brand name
    RootAPI.readAssetVariables = vi
      .fn()
      .mockResolvedValue({ data: { BRAND_NAME: 'Ascender Automation' } });
  });

  test('initially renders successfully', async () => {
    renderProject();
    expect(
      await screen.findByRole('tab', { name: 'Details' })
    ).toBeInTheDocument();
  });

  test('notifications tab shown for admins', async () => {
    renderProject();
    await screen.findByRole('tab', { name: 'Details' });

    expect(
      await screen.findByRole('tab', { name: 'Notifications' })
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(7));
  });

  test('tabs come in the order every screen gives them, with Runs last', async () => {
    renderProject();
    await screen.findByRole('tab', { name: 'Notifications' });

    await waitFor(() =>
      expect(
        screen.getAllByRole('tab').map((tab) => tab.textContent?.trim())
      ).toEqual([
        'Back to Projects',
        'Details',
        'Access',
        'Job Templates',
        'Notifications',
        'Schedules',
        'Runs',
      ])
    );
  });

  test('notifications tab hidden with reduced permissions', async () => {
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      data: { results: [] },
    } as unknown as ResponseOf<typeof OrganizationsAPI.read>);
    renderProject();
    await screen.findByRole('tab', { name: 'Details' });

    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(6));
    expect(
      screen.queryByRole('tab', { name: 'Notifications' })
    ).not.toBeInTheDocument();
  });

  test('schedules tab shown for scm based projects', async () => {
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      data: { results: [] },
    } as unknown as ResponseOf<typeof OrganizationsAPI.read>);
    renderProject();
    await screen.findByRole('tab', { name: 'Details' });

    expect(
      await screen.findByRole('tab', { name: 'Schedules' })
    ).toBeInTheDocument();
  });

  test('schedules tab hidden for manual projects', async () => {
    const manualDetails = { ...mockDetails, scm_type: '' };
    vi.mocked(ProjectsAPI.readDetail).mockResolvedValue({
      data: manualDetails,
    } as unknown as ResponseOf<typeof ProjectsAPI.readDetail>);
    vi.mocked(OrganizationsAPI.read).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      data: { results: [] },
    } as unknown as ResponseOf<typeof OrganizationsAPI.read>);
    renderProject();
    await screen.findByRole('tab', { name: 'Details' });

    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(4));
    expect(
      screen.queryByRole('tab', { name: 'Schedules' })
    ).not.toBeInTheDocument();
    // Never updated, so nothing to list either.
    expect(screen.queryByRole('tab', { name: 'Runs' })).not.toBeInTheDocument();
  });

  describe('runs tab', () => {
    beforeEach(() => {
      vi.mocked(UnifiedJobsAPI.read).mockResolvedValue({
        data: { count: 0, results: [] },
      } as unknown as ResponseOf<typeof UnifiedJobsAPI.read>);
      vi.mocked(UnifiedJobsAPI.readOptions).mockResolvedValue({
        data: { actions: { GET: {} }, related_search_fields: [] },
      } as unknown as ResponseOf<typeof UnifiedJobsAPI.readOptions>);
      vi.mocked(InventorySourcesAPI.readOptions).mockResolvedValue({
        data: { actions: { GET: {} } },
      } as unknown as ResponseOf<typeof InventorySourcesAPI.readOptions>);
    });

    test('offers a sync of this project to whoever may start one', async () => {
      renderProject('/projects/1/runs');
      expect(
        await screen.findByRole('button', { name: 'Run' })
      ).toBeInTheDocument();
      // The project's own sync, not the menu asking what to run.
      expect(screen.queryByText('Project Sync')).not.toBeInTheDocument();
    });

    test('offers no second sync while one is already running', async () => {
      // The last sync finished, but a newer one is in flight: the button
      // follows the running one, as it does on the details.
      vi.mocked(ProjectsAPI.readDetail).mockResolvedValue({
        data: {
          ...mockDetails,
          summary_fields: {
            ...mockDetails.summary_fields,
            current_job: { id: 9, status: 'running' },
          },
        },
      } as unknown as ResponseOf<typeof ProjectsAPI.readDetail>);
      renderProject('/projects/1/runs');
      expect(await screen.findByRole('button', { name: 'Run' })).toBeDisabled();
    });

    test('offers no run control, not the general menu, to whoever may not', async () => {
      vi.mocked(ProjectsAPI.readDetail).mockResolvedValue({
        data: {
          ...mockDetails,
          summary_fields: {
            ...mockDetails.summary_fields,
            user_capabilities: {
              ...mockDetails.summary_fields.user_capabilities,
              start: false,
            },
          },
        },
      } as unknown as ResponseOf<typeof ProjectsAPI.readDetail>);
      renderProject('/projects/1/runs');
      await waitFor(() => expect(UnifiedJobsAPI.read).toHaveBeenCalled());
      await screen.findByRole('tab', { name: 'Runs' });
      expect(
        screen.queryByRole('button', { name: 'Run' })
      ).not.toBeInTheDocument();
    });
  });

  describe('edit form options', () => {
    test('are read once, not again on every change of tab', async () => {
      // The api models share their read methods, so the credential type reads
      // are told from the others by what they ask for.
      const credentialTypeReads = () =>
        vi
          .mocked(CredentialTypesAPI.read)
          .mock.calls.filter(([params]) =>
            ['scm', 'cryptography'].includes(
              (params as { kind?: string } | undefined)?.kind ?? ''
            )
          ).length;
      const { history } = renderProject('/projects/1/details');
      await screen.findByText('Name');
      await waitFor(() => expect(credentialTypeReads()).toBe(2));

      act(() => history.push('/projects/1/job_templates'));
      await waitFor(() =>
        expect(ProjectsAPI.readDetail).toHaveBeenCalledTimes(2)
      );
      act(() => history.push('/projects/1/details'));
      await waitFor(() =>
        expect(ProjectsAPI.readDetail).toHaveBeenCalledTimes(3)
      );
      await screen.findByText('Name');

      // The scm and the cryptography credential types, each once.
      expect(credentialTypeReads()).toBe(2);
    });

    test('are not read for someone who cannot edit', async () => {
      vi.mocked(ProjectsAPI.readDetail).mockResolvedValue({
        data: {
          ...mockDetails,
          summary_fields: {
            ...mockDetails.summary_fields,
            user_capabilities: {
              ...mockDetails.summary_fields.user_capabilities,
              edit: false,
            },
          },
        },
      } as unknown as ResponseOf<typeof ProjectsAPI.readDetail>);
      renderProject('/projects/1/details');
      await screen.findByText('Name');

      expect(CredentialTypesAPI.read).not.toHaveBeenCalledWith({
        kind: 'scm',
      });
    });

    test('failing to read them leaves the details on screen', async () => {
      vi.mocked(ProjectsAPI.readOptions).mockRejectedValue(
        new Error('options unavailable')
      );
      renderProject('/projects/1/details');
      await waitFor(() => expect(ProjectsAPI.readOptions).toHaveBeenCalled());

      expect(await screen.findByText('Name')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument();
      expect(
        screen.queryByText('Something went wrong...')
      ).not.toBeInTheDocument();
    });
  });

  test('should show content error when user attempts to navigate to erroneous route', async () => {
    renderProject('/projects/1/foobar');
    expect(await screen.findByText('Not Found')).toBeInTheDocument();
  });

  test('redirects the bare /projects/:id to the details tab', async () => {
    renderProject('/projects/1');
    // ProjectDetail renders the project name detail
    expect(await screen.findByText('Name')).toBeInTheDocument();
  });
});
