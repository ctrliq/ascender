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

/*
 * The real error panel, which also counts every time it is drawn as Not Found.
 * The flash this guards against lasts one render, gone before any assertion
 * after the render could look for it, so the count is what can see it.
 */
const notFoundRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock('components/ContentError', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  const actual = await vi.importActual<
    typeof import('components/ContentError')
  >('components/ContentError');
  const Real = actual.default;
  return {
    __esModule: true,
    default: (props: React.ComponentProps<typeof Real>) => {
      if (props.isNotFound) {
        notFoundRenders.count += 1;
      }
      return ReactLib.createElement(Real, props);
    },
  };
});

// Markers for the routed tab panels, so assertions are about which branch of
// the nested v6 <Routes> tree resolves.
// The detail marker also shows the default Slack message it was handed, so a
// test can tell which of the OPTIONS defaults reached it.
vi.mock('./NotificationTemplateDetail', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: ({
      defaultMessages,
    }: {
      defaultMessages?: Record<string, { started?: { message?: string } }>;
    }) =>
      ReactLib.createElement(
        'div',
        null,
        ReactLib.createElement('div', null, 'NotificationTemplateDetail'),
        ReactLib.createElement(
          'div',
          { 'data-testid': 'slack-started' },
          defaultMessages?.slack?.started?.message ?? ''
        )
      ),
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
// under the same /notifications/:id/* route that
// NotificationTemplates.js gives it.
function renderAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return renderWithContexts(
    <Routes>
      <Route
        path="/notifications/:id/*"
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
    renderAt('/notifications/42/details');
    expect(
      await screen.findByText('NotificationTemplateDetail')
    ).toBeInTheDocument();
    expect(NotificationTemplatesAPI.readOptions).toHaveBeenCalled();
    // real route params are strings
    expect(NotificationTemplatesAPI.readDetail).toHaveBeenCalledWith('42');
  });

  test('renders the edit panel at /edit', async () => {
    renderAt('/notifications/42/edit');
    expect(
      await screen.findByText('NotificationTemplateEdit')
    ).toBeInTheDocument();
  });

  test('redirects the index path to details', async () => {
    const { history } = renderAt('/notifications/42');
    expect(
      await screen.findByText('NotificationTemplateDetail')
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(history.location.pathname).toBe('/notifications/42/details')
    );
  });

  test('shows a not-found error when the detail request 404s', async () => {
    const err = Object.assign(new Error('not found'), {
      response: { status: 404 },
    });
    vi.mocked(NotificationTemplatesAPI.readDetail).mockRejectedValue(err);
    renderAt('/notifications/42/details');
    expect(
      await screen.findByText('Notification Template not found.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('NotificationTemplateDetail')
    ).not.toBeInTheDocument();
  });

  test('shows a not-found error on an unknown tab', async () => {
    renderAt('/notifications/42/nope');
    expect(
      await screen.findByRole('link', {
        name: 'View Notification Template Details',
      })
    ).toHaveAttribute('href', '/notifications/42/details');
  });

  test('does not say Not Found while the template is still loading', async () => {
    vi.mocked(NotificationTemplatesAPI.readDetail).mockReturnValue(
      new Promise(() => {}) as ReturnType<
        typeof NotificationTemplatesAPI.readDetail
      >
    );
    notFoundRenders.count = 0;
    renderAt('/notifications/42/details');
    await waitFor(() =>
      expect(NotificationTemplatesAPI.readDetail).toHaveBeenCalled()
    );
    expect(
      screen.queryByRole('link', { name: 'View Notification Template Details' })
    ).not.toBeInTheDocument();
    expect(notFoundRenders.count).toBe(0);
  });

  /* The api keys its default messages by notification type, beside a default
     of its own that is empty for every type. */
  test('hands down the default messages of each notification type', async () => {
    const empty = { message: null, body: null };
    vi.mocked(NotificationTemplatesAPI.readOptions).mockResolvedValue({
      data: {
        actions: {
          POST: {
            messages: {
              type: 'json',
              default: { started: null, success: null, error: null },
              email: { started: empty },
              slack: { started: { message: 'slack default', body: null } },
            },
          },
        },
      },
    } as unknown as ApiResponse<unknown>);
    renderAt('/notifications/42/details');
    expect(await screen.findByTestId('slack-started')).toHaveTextContent(
      'slack default'
    );
  });
});
