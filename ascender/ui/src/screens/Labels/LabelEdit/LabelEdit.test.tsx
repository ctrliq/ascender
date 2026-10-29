import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Route, Routes } from 'react-router';
import { LabelsAPI, UsersAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import LabelEdit from './LabelEdit';

vi.mock('../../../api/models/Labels');
vi.mock('../../../api/models/Organizations');
vi.mock('../../../api/models/Users');

/**
 * Renders the edit page at an address, with the list behind it to land on.
 *
 * Args:
 *     path: The address to open.
 *     me: The current user, a superuser unless a test says otherwise.
 *
 * Returns:
 *     What renderWithContexts returns, the history it was given among it.
 */
function renderAt(path: string, me?: Record<string, unknown>) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route path="/labels/:id/edit" element={<LabelEdit />} />
      <Route path="/labels" element={<p>the list</p>} />
    </Routes>,
    { context: { router: { history }, ...(me ? { config: { me } } : {}) } }
  );
}

const blue = {
  data: {
    id: 5,
    name: 'blue',
    organization: 1,
    summary_fields: { organization: { id: 1, name: 'Default' } },
  },
} as unknown as ResponseOf<typeof LabelsAPI.readDetail>;

/**
 * Has the current user administer the given organizations.
 *
 * Args:
 *     ids: The ids of the organizations the user is an admin of.
 */
function administer(ids: number[]) {
  vi.mocked(UsersAPI.readAdminOfOrganizations).mockResolvedValue({
    data: { count: ids.length, results: ids.map((id) => ({ id })) },
  } as unknown as ResponseOf<typeof UsersAPI.readAdminOfOrganizations>);
}

describe('<LabelEdit />', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  /*
   * The page starts on the loading animation, before the read has begun,
   * rather than drawing an empty card first.
   */
  test('starts on the loading animation, not an empty card', () => {
    vi.mocked(LabelsAPI.readDetail).mockReturnValue(new Promise(() => {}));
    const { container } = renderAt('/labels/5/edit');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(container.querySelector('.pf-v6-c-card')).toBeNull();
  });

  test('says a label that is not there is not found, with a way back', async () => {
    vi.mocked(LabelsAPI.readDetail).mockRejectedValue(
      Object.assign(new Error('not found'), {
        response: {
          status: 404,
          config: { method: 'get', url: '/api/v2/labels/5/' },
          data: {},
        },
      })
    );
    renderAt('/labels/5/edit');
    expect(await screen.findByText('Label not found.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'View all Labels.' })
    ).toHaveAttribute('href', '/labels');
  });

  test('shows the form once the label is read', async () => {
    vi.mocked(LabelsAPI.readDetail).mockResolvedValue({
      data: {
        id: 5,
        name: 'blue',
        organization: 1,
        summary_fields: { organization: { id: 1, name: 'Default' } },
      },
    } as unknown as ResponseOf<typeof LabelsAPI.readDetail>);
    renderAt('/labels/5/edit');
    expect(await screen.findByDisplayValue('blue')).toBeInTheDocument();
  });
  /*
   * The api lets only a superuser or an admin of the label's organization
   * change it, so anyone else who opens the address directly is sent back to
   * the list rather than handed a form that can only end in 403.
   */
  test('sends someone who may not change the label back to the list', async () => {
    vi.mocked(LabelsAPI.readDetail).mockResolvedValue(blue);
    administer([2]);
    const { history } = renderAt('/labels/5/edit', {
      id: 7,
      is_superuser: false,
    });
    expect(await screen.findByText('the list')).toBeInTheDocument();
    expect(history.location.pathname).toBe('/labels');
    expect(screen.queryByDisplayValue('blue')).not.toBeInTheDocument();
  });

  test("shows the form to an admin of the label's organization", async () => {
    vi.mocked(LabelsAPI.readDetail).mockResolvedValue(blue);
    administer([1]);
    renderAt('/labels/5/edit', { id: 7, is_superuser: false });
    expect(await screen.findByDisplayValue('blue')).toBeInTheDocument();
  });
});
