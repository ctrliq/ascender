import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../../testUtils/settingOptions';
import TokensEdit from './TokensEdit';

vi.mock('../../../../api');

describe('<TokensEdit />', () => {
  let history: TestHistory;

  beforeEach(() => {
    vi.mocked(SettingsAPI.updateAll).mockResolvedValue(
      {} as unknown as ResponseOf<typeof SettingsAPI.updateAll>
    );
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: {
        OAUTH2_PROVIDER: {
          ACCESS_TOKEN_EXPIRE_SECONDS: 3600,
          REFRESH_TOKEN_EXPIRE_SECONDS: 7200,
          AUTHORIZATION_CODE_EXPIRE_SECONDS: 60,
        },
        ALLOW_OAUTH2_FOR_EXTERNAL_USERS: true,
        // On the Session tab, in the same category: a revert here must leave
        // it alone.
        DISABLE_LOCAL_AUTH: true,
      },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function renderEdit() {
    history = createMemoryHistory({
      initialEntries: ['/authentication/tokens/edit'],
    });
    const result = renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <TokensEdit />
      </SettingsProvider>,
      { context: { router: { history } } }
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    return result;
  }

  test('should revert only the settings this page shows', async () => {
    const { user } = await renderEdit();
    await user.click(
      screen.getByRole('button', { name: 'Revert All to Default' })
    );
    await user.click(
      screen.getByRole('button', { name: 'Confirm revert all' })
    );
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    // The token settings at their defaults and nothing else: a DELETE on the
    // authentication category would also reset Session, Password and Mapping.
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      OAUTH2_PROVIDER: {
        ACCESS_TOKEN_EXPIRE_SECONDS: 31536000000,
        AUTHORIZATION_CODE_EXPIRE_SECONDS: 600,
        REFRESH_TOKEN_EXPIRE_SECONDS: 2628000,
      },
      ALLOW_OAUTH2_FOR_EXTERNAL_USERS: false,
    });
    expect(SettingsAPI.revertCategory).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/authentication/tokens/details'
      )
    );
  });

  test('should save an unset external users switch as off, not as text', async () => {
    // A setting the category leaves out used to seed the switch with an empty
    // string, which went back to the api as '' on a save of the other fields.
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: {
        OAUTH2_PROVIDER: {
          ACCESS_TOKEN_EXPIRE_SECONDS: 3600,
          REFRESH_TOKEN_EXPIRE_SECONDS: 7200,
          AUTHORIZATION_CODE_EXPIRE_SECONDS: 60,
        },
      },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith(
      expect.objectContaining({ ALLOW_OAUTH2_FOR_EXTERNAL_USERS: false })
    );
  });
});
