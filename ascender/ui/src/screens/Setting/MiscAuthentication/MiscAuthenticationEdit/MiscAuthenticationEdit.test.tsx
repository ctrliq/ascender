import React from 'react';
import { screen, waitFor, within, fireEvent } from '@testing-library/react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../../testUtils/settingOptions';
import mockAllSettings from '../../shared/data.allSettings.json';
import MiscAuthenticationEdit from './MiscAuthenticationEdit';

vi.mock('../../../../api');

const authenticationData = {
  SESSION_COOKIE_AGE: 1800,
  SESSIONS_PER_USER: -1,
  DISABLE_LOCAL_AUTH: false,
  AUTH_BASIC_ENABLED: true,
  OAUTH2_PROVIDER: {
    ACCESS_TOKEN_EXPIRE_SECONDS: 31536000000,
    REFRESH_TOKEN_EXPIRE_SECONDS: 2628000,
    AUTHORIZATION_CODE_EXPIRE_SECONDS: 600,
  },
  ALLOW_OAUTH2_FOR_EXTERNAL_USERS: false,
  LOGIN_REDIRECT_OVERRIDE: '',
  AUTHENTICATION_BACKENDS: [
    'awx.sso.backends.TACACSPlusBackend',
    'awx.main.backends.AWXModelBackend',
  ],
  SOCIAL_AUTH_ORGANIZATION_MAP: null,
  SOCIAL_AUTH_TEAM_MAP: null,
  SOCIAL_AUTH_USER_FIELDS: null,
  SOCIAL_AUTH_USERNAME_IS_FULL_EMAIL: false,
  LOCAL_PASSWORD_MIN_LENGTH: 0,
  LOCAL_PASSWORD_MIN_DIGITS: 0,
  LOCAL_PASSWORD_MIN_UPPER: 0,
  LOCAL_PASSWORD_MIN_SPECIAL: 0,
};

describe('<MiscAuthenticationEdit />', () => {
  let history: TestHistory;

  beforeEach(() => {
    vi.mocked(SettingsAPI.revertCategory).mockResolvedValue(
      {} as unknown as ResponseOf<typeof SettingsAPI.revertCategory>
    );
    vi.mocked(SettingsAPI.updateAll).mockResolvedValue(
      {} as unknown as ResponseOf<typeof SettingsAPI.updateAll>
    );
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: mockAllSettings,
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function renderEdit() {
    history = createMemoryHistory({
      initialEntries: ['/authentication/session/edit'],
    });
    const result = renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <MiscAuthenticationEdit />
      </SettingsProvider>,
      { context: { router: { history } } }
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    return result;
  }

  test('initially renders without crashing', async () => {
    await renderEdit();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test('should enable edit login redirect once alert is confirmed', async () => {
    const { user, container } = await renderEdit();
    const input = container.querySelector('#LOGIN_REDIRECT_OVERRIDE');
    expect(input).toHaveAttribute('disabled');

    // fireEvent (not user.click) avoids the hover that engages the button's
    // tooltip; the button unmounts on confirm, and a pending tooltip timer
    // would otherwise log an unmounted-component warning into the next test.
    fireEvent.click(
      container.querySelector(
        'button[data-ouia-component-id="confirm-edit-login-redirect"]'
      )!
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'confirm edit login redirect',
      })
    );

    await waitFor(() => expect(input).not.toHaveAttribute('disabled'));

    await user.type(input!, 'bar');
    expect(input).toHaveValue('bar');
    await settleTooltips();
  });

  /*
   * This tab's own settings and no others: the tokens, the mapping and the
   * password rules arrive in the same category and are saved from the three
   * tabs beside it.
   */
  test('save button should call updateAll', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      SESSION_COOKIE_AGE: authenticationData.SESSION_COOKIE_AGE,
      SESSIONS_PER_USER: authenticationData.SESSIONS_PER_USER,
      DISABLE_LOCAL_AUTH: authenticationData.DISABLE_LOCAL_AUTH,
      AUTH_BASIC_ENABLED: authenticationData.AUTH_BASIC_ENABLED,
      LOGIN_REDIRECT_OVERRIDE: authenticationData.LOGIN_REDIRECT_OVERRIDE,
      ALLOW_METRICS_FOR_ANONYMOUS_USERS: false,
    });
  });

  test('should successfully send default values to api on form revert all', async () => {
    const { user } = await renderEdit();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    expect(screen.queryByText('Revert Settings')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Revert All to Default' })
    );
    expect(await screen.findByText('Revert Settings')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm revert all' })
    );
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    // Only the settings this page shows, each at its default: a DELETE on
    // the category would reset what the page does not show as well.
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      SESSION_COOKIE_AGE: 1800,
      SESSIONS_PER_USER: -1,
      DISABLE_LOCAL_AUTH: false,
      AUTH_BASIC_ENABLED: true,
      LOGIN_REDIRECT_OVERRIDE: '',
      ALLOW_METRICS_FOR_ANONYMOUS_USERS: false,
    });
    expect(SettingsAPI.revertCategory).not.toHaveBeenCalled();
  });

  test('should successfully send request to api on form submission', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
  });

  test('should navigate to miscellaneous detail on successful submission', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/authentication/session/details'
      )
    );
  });

  test('should navigate to miscellaneous detail when cancel is clicked', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual(
      '/authentication/session/details'
    );
  });

  test('should display error message on unsuccessful submission', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    vi.mocked(SettingsAPI.updateAll).mockImplementation(() =>
      Promise.reject(error)
    );
    const { user } = await renderEdit();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('An error occurred')).toBeInTheDocument();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1);
  });

  test('should display ContentError on throw', async () => {
    vi.mocked(SettingsAPI.readCategory).mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    await renderEdit();
    expect(
      screen.getByText(
        'There was an error loading this content. Please reload the page.'
      )
    ).toBeInTheDocument();
  });
});
