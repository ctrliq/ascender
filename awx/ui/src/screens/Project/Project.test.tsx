import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { OrganizationsAPI, ProjectsAPI, RootAPI } from 'api';
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
  return renderWithContexts(
    <Routes>
      <Route
        path="/projects/:id/*"
        element={<Project setBreadcrumb={() => {}} me={mockMe} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<Project />', () => {
  beforeEach(() => {
    vi.mocked(ProjectsAPI.readDetail).mockResolvedValue({
      data: mockDetails,
    } as unknown as ResponseOf<typeof ProjectsAPI.readDetail>);
    vi.mocked(OrganizationsAPI.read).mockImplementation(
      getOrganizations as unknown as typeof OrganizationsAPI.read
    );
    // the resolved detail route mounts components that read the brand name
    RootAPI.readAssetVariables = vi
      .fn()
      .mockResolvedValue({ data: { BRAND_NAME: 'AWX' } });
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
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(6));
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

    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(5));
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
