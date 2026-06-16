import React from 'react';
import { screen, waitFor, within, fireEvent } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import mockAllSettings from '../../shared/data.allSettings.json';
import MiscAuthenticationEdit from './MiscAuthenticationEdit';

jest.mock('../../../../api');

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
  let history;

  beforeEach(() => {
    SettingsAPI.revertCategory.mockResolvedValue({});
    SettingsAPI.updateAll.mockResolvedValue({});
    SettingsAPI.readCategory.mockResolvedValue({
      data: mockAllSettings,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function renderEdit() {
    history = createMemoryHistory({
      initialEntries: ['/settings/miscellaneous_authentication/edit'],
    });
    const result = renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
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
      )
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'confirm edit login redirect',
      })
    );

    await waitFor(() => expect(input).not.toHaveAttribute('disabled'));

    await user.type(input, 'bar');
    expect(input).toHaveValue('bar');
    await settleTooltips();
  });

  test('save button should call updateAll', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1)
    );
    const { AUTHENTICATION_BACKENDS, ...rest } = authenticationData;
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith(rest);
  });

  test('should successfully send default values to api on form revert all', async () => {
    const { user } = await renderEdit();
    expect(SettingsAPI.revertCategory).toHaveBeenCalledTimes(0);
    expect(screen.queryByText('Revert settings')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Revert all to default' })
    );
    expect(await screen.findByText('Revert settings')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm revert all' })
    );
    await waitFor(() =>
      expect(SettingsAPI.revertCategory).toHaveBeenCalledTimes(1)
    );
    expect(SettingsAPI.revertCategory).toHaveBeenCalledWith('authentication');
  });

  test('should successfully send request to api on form submission', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1)
    );
  });

  test('should navigate to miscellaneous detail on successful submission', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/settings/miscellaneous_authentication/details'
      )
    );
  });

  test('should navigate to miscellaneous detail when cancel is clicked', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual(
      '/settings/miscellaneous_authentication/details'
    );
  });

  test('should display error message on unsuccessful submission', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    SettingsAPI.updateAll.mockImplementation(() => Promise.reject(error));
    const { user } = await renderEdit();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('An error occurred')).toBeInTheDocument();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1);
  });

  test('should display ContentError on throw', async () => {
    SettingsAPI.readCategory.mockImplementationOnce(() =>
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
