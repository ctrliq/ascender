import type { ApiResponse } from 'api/Base';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { NotificationTemplatesAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import NotificationTemplate from './NotificationTemplate';

vi.mock('../../api/models/NotificationTemplates');

// Markers for the routed tab panels, so assertions are about which branch of
// the nested v6 <Routes> tree resolves.
vi.mock('./NotificationTemplateDetail', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'NotificationTemplateDetail'),
  };
});
vi.mock('./NotificationTemplateEdit', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () =>
      ReactLib.createElement('div', null, 'NotificationTemplateEdit'),
  };
});

const template = {
  id: 42,
  name: 'Foo',
  summary_fields: { user_capabilities: { edit: true, delete: true } },
};
const options = { data: { actions: { POST: { messages: null } } } };

// NotificationTemplate uses paths relative to its parent route, so mount it
// under the same /notification_templates/:id/* route that
// NotificationTemplates.js gives it.
function renderAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/notification_templates/:id/*"
        element={<NotificationTemplate setBreadcrumb={() => {}} />}
      />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<NotificationTemplate />', () => {
  beforeEach(() => {
    vi.mocked(NotificationTemplatesAPI.readDetail).mockResolvedValue({
      data: template,
    } as unknown as ResponseOf<typeof NotificationTemplatesAPI.readDetail>);
    vi.mocked(NotificationTemplatesAPI.readOptions).mockResolvedValue(
      options as unknown as ApiResponse<unknown>
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('fetches the template detail and options', async () => {
    renderAt('/notification_templates/42/details');
    expect(
      await screen.findByText('NotificationTemplateDetail')
    ).toBeInTheDocument();
    expect(NotificationTemplatesAPI.readOptions).toHaveBeenCalled();
    // real route params are strings
    expect(NotificationTemplatesAPI.readDetail).toHaveBeenCalledWith('42');
  });

  test('renders the edit panel at /edit', async () => {
    renderAt('/notification_templates/42/edit');
    expect(
      await screen.findByText('NotificationTemplateEdit')
    ).toBeInTheDocument();
  });

  test('redirects the index path to details', async () => {
    const { history } = renderAt('/notification_templates/42');
    expect(
      await screen.findByText('NotificationTemplateDetail')
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(history.location.pathname).toBe(
        '/notification_templates/42/details'
      )
    );
  });

  test('shows a not-found error when the detail request 404s', async () => {
    const err = Object.assign(new Error('not found'), {
      response: { status: 404 },
    });
    vi.mocked(NotificationTemplatesAPI.readDetail).mockRejectedValue(err);
    renderAt('/notification_templates/42/details');
    expect(
      await screen.findByText('Notification Template not found.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('NotificationTemplateDetail')
    ).not.toBeInTheDocument();
  });
});
