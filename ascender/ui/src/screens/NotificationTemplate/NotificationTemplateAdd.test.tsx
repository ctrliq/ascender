import React from 'react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { screen } from '@testing-library/react';
import { NotificationTemplatesAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import NotificationTemplateAdd from './NotificationTemplateAdd';

vi.mock('../../api');

// The form itself is covered on its own; what matters here is what the add
// screen hands it and where Cancel goes.
vi.mock('./shared/NotificationTemplateForm', () => ({
  default: function MockNotificationTemplateForm({
    template,
    onCancel,
  }: {
    template?: { summary_fields?: { organization?: { name: string } } };
    onCancel: () => void;
  }) {
    return (
      <div>
        <span data-testid="form-organization">
          {template?.summary_fields?.organization?.name ?? ''}
        </span>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  },
}));

describe('<NotificationTemplateAdd />', () => {
  let history: TestHistory;

  const renderAdd = (state?: unknown) => {
    history = createMemoryHistory({
      initialEntries: [{ pathname: '/notifications/add', state }],
    });
    return renderWithContexts(<NotificationTemplateAdd />, {
      context: { router: { history } },
    });
  };

  beforeEach(() => {
    vi.mocked(NotificationTemplatesAPI.readOptions).mockResolvedValue({
      data: { actions: { POST: { messages: {} } } },
    } as unknown as ResponseOf<typeof NotificationTemplatesAPI.readOptions>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('starts empty and cancels to every template', async () => {
    const { user } = renderAdd();
    expect(await screen.findByTestId('form-organization')).toHaveTextContent(
      ''
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toBe('/notifications');
  });

  test('from an organization, starts in it and cancels back to it', async () => {
    const { user } = renderAdd({
      organization: { id: 71, name: 'measure-org' },
    });
    expect(await screen.findByTestId('form-organization')).toHaveTextContent(
      'measure-org'
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toBe('/organizations/71/notifications');
  });
});
