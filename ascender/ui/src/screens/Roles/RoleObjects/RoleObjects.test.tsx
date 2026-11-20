import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { JobTemplatesAPI, InstanceGroupsAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { createMemoryHistory } from '../../../../testUtils/historyShim';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import RoleObjects from './RoleObjects';

vi.mock('../../../api/models/JobTemplates');
vi.mock('../../../api/models/InstanceGroups');

const templates = [
  {
    id: 5,
    type: 'job_template',
    name: 'A job template',
    summary_fields: { organization: { id: 1, name: 'Default' } },
  },
  {
    id: 6,
    type: 'job_template',
    name: 'Another job template',
    summary_fields: {},
  },
];

const options = {
  data: { actions: { GET: {} }, related_search_fields: [] },
} as unknown as ResponseOf<typeof JobTemplatesAPI.readOptions>;

function mockTemplates() {
  vi.mocked(JobTemplatesAPI.read).mockResolvedValue({
    data: { count: templates.length, results: templates },
  } as unknown as ResponseOf<typeof JobTemplatesAPI.read>);
  vi.mocked(JobTemplatesAPI.readOptions).mockResolvedValue(options);
}

async function renderObjects(path = '/roles/jobtemplate/admin_role/objects') {
  const history = createMemoryHistory({ initialEntries: [path] });
  const utils = renderWithContexts(
    <Routes>
      <Route
        path="/roles/:model/:roleField/objects"
        element={<RoleObjects />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
  await waitFor(() =>
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  );
  return utils;
}

describe('<RoleObjects />', () => {
  beforeEach(() => {
    mockTemplates();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /*
   * Every object of the kind carries the role, so the tab lists the kind: read
   * from its own endpoint, which is the one that searches, orders and pages.
   */
  test('should list what carries the role, each a way into it', async () => {
    await renderObjects();

    expect(
      await screen.findByRole('link', { name: 'A job template' })
    ).toHaveAttribute(
      'href',
      expect.stringContaining('/templates/job_template/5/details')
    );
    expect(JobTemplatesAPI.read).toHaveBeenCalled();
  });

  test('should name the organization each one belongs to', async () => {
    await renderObjects();

    const rows = await screen.findAllByRole('row');
    const cells = rows.map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent?.trim())
    );
    expect(cells).toContainEqual(['A job template', 'Default']);
    // A dash where there is none, as the label lists write an empty count.
    expect(cells).toContainEqual(['Another job template', '-']);
  });

  /** An instance group belongs to no organization, so there is no column. */
  test('should leave out the organization where a kind has none', async () => {
    vi.mocked(InstanceGroupsAPI.read).mockResolvedValue({
      data: {
        count: 1,
        results: [{ id: 2, type: 'instance_group', name: 'default' }],
      },
    } as unknown as ResponseOf<typeof InstanceGroupsAPI.read>);
    vi.mocked(InstanceGroupsAPI.readOptions).mockResolvedValue(
      options as unknown as ResponseOf<typeof InstanceGroupsAPI.readOptions>
    );

    await renderObjects('/roles/instancegroup/admin_role/objects');

    expect(await screen.findByText('default')).toBeInTheDocument();
    expect(
      screen.queryByRole('columnheader', { name: 'Organization' })
    ).not.toBeInTheDocument();
  });
});
