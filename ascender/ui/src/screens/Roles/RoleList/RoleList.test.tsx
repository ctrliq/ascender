import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Route, Routes } from 'react-router';
import { CredentialsAPI, JobTemplatesAPI, RolesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import RoleList from './RoleList';

/*
 * Per model rather than the whole api: every model inherits read from the same
 * base, so mocking the barrel gives them one function between them and the
 * last answer set wins for all of them.
 */
vi.mock('../../../api/models/Credentials');
vi.mock('../../../api/models/JobTemplates');
vi.mock('../../../api/models/Roles');

/** What an object carries: the same roles on every object of its kind. */
const objectRoles = (roles: Record<string, unknown>) =>
  ({
    data: {
      count: 1,
      results: [{ id: 1, summary_fields: { object_roles: roles } }],
    },
  }) as unknown as ResponseOf<typeof CredentialsAPI.read>;

function mockKinds() {
  vi.mocked(CredentialsAPI.read).mockResolvedValue(
    objectRoles({
      admin_role: { name: 'Admin', description: 'Can manage the credential' },
      use_role: { name: 'Use', description: 'Can use the credential' },
    })
  );
  vi.mocked(JobTemplatesAPI.read).mockResolvedValue(
    objectRoles({
      admin_role: { name: 'Admin', description: 'Can manage the template' },
      execute_role: { name: 'Execute', description: 'May run the template' },
      read_role: { name: 'Read', description: 'May view the template' },
    }) as unknown as ResponseOf<typeof JobTemplatesAPI.read>
  );
  mockSystemRoles({
    system_administrator: {
      id: 1,
      name: 'System Administrator',
      description: 'Can manage the system',
    },
    system_auditor: {
      id: 2,
      name: 'System Auditor',
      description: 'Can view the system',
    },
  });
}

/**
 * The two roles on nothing, answered by the field they are asked for by, the
 * way the api filters them.
 */
function mockSystemRoles(roles: Record<string, Record<string, unknown>>) {
  vi.mocked(RolesAPI.read).mockImplementation((async (params?: {
    role_field?: string;
  }) => {
    const role = roles[params?.role_field ?? ''];
    return {
      data: { count: role ? 1 : 0, results: role ? [role] : [] },
    };
  }) as unknown as typeof RolesAPI.read);
}

/** The list at its own addresses, /roles and /roles/:model, as Roles routes it. */
function renderRouted(path = '/roles') {
  const history = createMemoryHistory({ initialEntries: [path] });
  const utils = renderWithContexts(
    <Routes>
      <Route path="/roles/:model" element={<RoleList />} />
      <Route path="/roles" element={<RoleList />} />
    </Routes>,
    { context: { router: { history } } }
  );
  return { ...utils, history };
}

async function renderList(path = '/roles') {
  const utils = renderRouted(path);
  await waitFor(() =>
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  );
  return utils;
}

describe('<RoleList />', () => {
  beforeEach(() => {
    mockKinds();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /*
   * Every object of a kind carries the same roles, so the list is those roles
   * once rather than once per object: three rows, not three per template.
   */
  test('should list the roles a kind carries, once each', async () => {
    await renderList();

    expect(await screen.findByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Use')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(CredentialsAPI.read).toHaveBeenCalledWith(
      expect.objectContaining({ page_size: 1 })
    );
  });

  /*
   * The rows are held rather than fetched a page at a time, so the paging and
   * the search are applied to what is held: the screen still reads like every
   * other list, pagination above the table and below it.
   */
  test('should page and search what it is holding', async () => {
    const { user } = await renderList();

    expect(await screen.findByText('Admin')).toBeInTheDocument();
    // Above the table and below it, as on every other list.
    expect(document.querySelectorAll('.pf-v6-c-pagination')).toHaveLength(2);

    // A search input, so searchbox rather than textbox.
    await user.type(
      screen.getByRole('searchbox', { name: 'Search text input' }),
      'use{enter}'
    );

    await waitFor(() => expect(screen.queryByText('Admin')).toBeNull());
    expect(screen.getByText('Use')).toBeInTheDocument();
  });

  /* Ordered here too, for the same reason the rows are read here. */
  test('should reorder the rows from the name column', async () => {
    const { user } = await renderList();

    const names = () =>
      [...document.querySelectorAll('tbody tr td:first-child')].map((cell) =>
        cell.textContent?.trim()
      );
    expect(names()).toEqual(['Admin', 'Use']);

    await user.click(screen.getByRole('button', { name: 'Name' }));

    await waitFor(() => expect(names()).toEqual(['Use', 'Admin']));
  });

  test('should offer a tab for every kind of object a role is on', async () => {
    await renderList();

    [
      'Credentials',
      'Instance Groups',
      'Inventories',
      'Job Templates',
      'Organizations',
      'Projects',
      'System',
      'Teams',
      'Workflow Templates',
    ].forEach((name) => {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    });
    expect(screen.queryByRole('tab', { name: 'All' })).not.toBeInTheDocument();
  });

  test('should read the chosen kind from one of its objects', async () => {
    const { user } = await renderList();

    await user.click(screen.getByRole('tab', { name: 'Job Templates' }));

    expect(await screen.findByText('Execute')).toBeInTheDocument();
    expect(JobTemplatesAPI.read).toHaveBeenCalledWith(
      expect.objectContaining({ page_size: 1 })
    );
  });

  /*
   * The page is in the address and the tab is not, so a page kept across a
   * change of tab could fall past the end of a kind with fewer roles.
   */
  test('should start another kind on its first page', async () => {
    const { user, history } = renderRouted(
      '/roles?role.page=2&role.page_size=1'
    );
    // The second of the credential's Admin and Use.
    expect(await screen.findByText('Use')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Job Templates' }));

    await waitFor(() =>
      expect(history.location.search).not.toContain('role.page=')
    );
    // The rest of the address is kept.
    expect(history.location.search).toContain('role.page_size=1');
    expect(await screen.findByText('Admin')).toBeInTheDocument();
  });

  /** A role on nothing has no object to read it from, so it is its own row. */
  test('should take the system roles from the roles themselves', async () => {
    const { user } = await renderList();

    await user.click(screen.getByRole('tab', { name: 'System' }));

    expect(await screen.findByText('System Administrator')).toBeInTheDocument();
    expect(RolesAPI.read).toHaveBeenCalledWith(
      expect.objectContaining({
        content_type__isnull: 'true',
        role_field: 'system_administrator',
      })
    );
    expect(
      screen.getByRole('link', { name: 'System Auditor' })
    ).toHaveAttribute(
      'href',
      expect.stringContaining('/roles/system/system_auditor/details')
    );
  });

  /*
   * The api names a role in the viewer's language, so the field the detail is
   * opened by cannot be read off the name.
   */
  test('should key the system roles by field in any language', async () => {
    mockSystemRoles({
      system_administrator: {
        id: 1,
        name: 'Administrador del sistema',
        description: '',
      },
      system_auditor: { id: 2, name: 'Auditor del sistema', description: '' },
    });
    await renderList('/roles/system');

    expect(
      await screen.findByRole('link', { name: 'Administrador del sistema' })
    ).toHaveAttribute(
      'href',
      expect.stringContaining('/roles/system/system_administrator/details')
    );
    expect(
      screen.getByRole('link', { name: 'Auditor del sistema' })
    ).toHaveAttribute(
      'href',
      expect.stringContaining('/roles/system/system_auditor/details')
    );
  });

  /*
   * A kind's roles are read off one of its objects, so a viewer who can see
   * none of them has nothing to read from, which the empty list says rather
   * than claiming the kind has no roles.
   */
  test('should say when there is no object to read the roles from', async () => {
    vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
      data: { count: 0, results: [] },
    } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
    await renderList('/roles/jobtemplate');

    expect(
      await screen.findByText('No objects of this kind to read roles from')
    ).toBeInTheDocument();
    expect(screen.queryByText('No Roles Found')).not.toBeInTheDocument();
  });

  test('should open a role by the field the api keys it on', async () => {
    await renderList();

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute(
      'href',
      expect.stringContaining('/roles/credential/admin_role/details')
    );
  });

  /*
   * The kind is the address, so a reload or a shared link opens the tab that
   * was showing, and the trail's crumb for the kind agrees with it.
   */
  test('should put the chosen kind in the address', async () => {
    const { user, history } = await renderList('/roles?role.name__icontains=a');

    await user.click(screen.getByRole('tab', { name: 'Job Templates' }));

    await waitFor(() =>
      expect(history.location.pathname).toBe('/roles/jobtemplate')
    );
    expect(history.location.search).toContain('role.name__icontains=a');
  });

  test('should open the kind the address names', async () => {
    await renderList('/roles/jobtemplate');

    expect(screen.getByRole('tab', { name: 'Job Templates' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(await screen.findByText('Execute')).toBeInTheDocument();
  });

  test('should not find a kind the platform does not have', async () => {
    renderRouted('/roles/bogus');

    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});
