import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import GoogleOAuth2Edit from './GoogleOAuth2Edit';

jest.mock('../../../../api');

const mockSettings = {
  SOCIAL_AUTH_GOOGLE_OAUTH2_CALLBACK_URL:
    'https://towerhost/sso/complete/google-oauth2/',
  SOCIAL_AUTH_GOOGLE_OAUTH2_KEY: 'mock key',
  SOCIAL_AUTH_GOOGLE_OAUTH2_SECRET: '$encrypted$',
  SOCIAL_AUTH_GOOGLE_OAUTH2_WHITELISTED_DOMAINS: ['example.com', 'example_2.com'],
  SOCIAL_AUTH_GOOGLE_OAUTH2_AUTH_EXTRA_ARGUMENTS: {},
  SOCIAL_AUTH_GOOGLE_OAUTH2_ORGANIZATION_MAP: { Default: {} },
  SOCIAL_AUTH_GOOGLE_OAUTH2_TEAM_MAP: {},
};

describe('<GoogleOAuth2Edit />', () => {
  let history;

  beforeEach(() => {
    SettingsAPI.revertCategory.mockResolvedValue({});
    SettingsAPI.updateAll.mockResolvedValue({});
    SettingsAPI.readCategory.mockResolvedValue({ data: mockSettings });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function mountEdit() {
    history = createMemoryHistory({
      initialEntries: ['/settings/google_oauth2/edit'],
    });
    // The production read mutates the shared OPTIONS objects (sets .value), so
    // deep-clone to keep tests isolated.
    const result = renderWithContexts(
      <SettingsProvider value={JSON.parse(JSON.stringify(mockAllOptions.actions))}>
        <GoogleOAuth2Edit />
      </SettingsProvider>,
      { context: { router: { history } } }
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    return result;
  }

  test('initially renders without crashing', async () => {
    const { container } = await mountEdit();
    expect(
      container.querySelector('#SOCIAL_AUTH_GOOGLE_OAUTH2_KEY')
    ).toBeInTheDocument();
  });

  test('should display expected form fields', async () => {
    await mountEdit();
    // labelIcon Popovers break getByLabelText, so assert each field's label and
    // (where applicable) its input by id.
    expect(screen.getByText('Google OAuth2 Key')).toBeInTheDocument();
    expect(screen.getByText('Google OAuth2 Secret')).toBeInTheDocument();
    expect(screen.getByText('Google OAuth2 Allowed Domains')).toBeInTheDocument();
    expect(screen.getByText('Google OAuth2 Extra Arguments')).toBeInTheDocument();
    expect(screen.getByText('Google OAuth2 Organization Map')).toBeInTheDocument();
    expect(screen.getByText('Google OAuth2 Team Map')).toBeInTheDocument();
  });

  test('should successfully send default values to api on form revert all', async () => {
    const { user } = await mountEdit();
    expect(SettingsAPI.revertCategory).toHaveBeenCalledTimes(0);
    expect(screen.queryByText('Revert settings')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Revert all to default' })
    );
    expect(await screen.findByText('Revert settings')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm revert all' }));
    await waitFor(() =>
      expect(SettingsAPI.revertCategory).toHaveBeenCalledTimes(1)
    );
    expect(SettingsAPI.revertCategory).toHaveBeenCalledWith('google-oauth2');
  });

  test('should successfully send request to api on form submission', async () => {
    const { container, user } = await mountEdit();
    // Revert the encrypted secret and the allowed-domains list to their factory
    // defaults ('' and []), then change the key. The organization map is driven
    // by a CodeEditor, which renders empty under jsdom, so it keeps its initial
    // value ({ Default: {} }) on submit.
    const revertButtons = container.querySelectorAll(
      'button[data-ouia-component-id="SOCIAL_AUTH_GOOGLE_OAUTH2_SECRET-revert"], button[data-ouia-component-id="SOCIAL_AUTH_GOOGLE_OAUTH2_WHITELISTED_DOMAINS-revert"]'
    );
    expect(revertButtons.length).toBe(2);
    await user.click(revertButtons[0]);
    await user.click(revertButtons[1]);

    const keyInput = container.querySelector('#SOCIAL_AUTH_GOOGLE_OAUTH2_KEY');
    await user.clear(keyInput);
    await user.type(keyInput, 'new key');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      SOCIAL_AUTH_GOOGLE_OAUTH2_KEY: 'new key',
      SOCIAL_AUTH_GOOGLE_OAUTH2_SECRET: '',
      SOCIAL_AUTH_GOOGLE_OAUTH2_WHITELISTED_DOMAINS: [],
      SOCIAL_AUTH_GOOGLE_OAUTH2_AUTH_EXTRA_ARGUMENTS: {},
      SOCIAL_AUTH_GOOGLE_OAUTH2_TEAM_MAP: {},
      SOCIAL_AUTH_GOOGLE_OAUTH2_ORGANIZATION_MAP: {
        Default: {},
      },
    });
  });

  test('should navigate to Google OAuth 2.0 detail on successful submission', async () => {
    const { user } = await mountEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/settings/google_oauth2/details')
    );
  });

  test('should navigate to Google OAuth 2.0 detail when cancel is clicked', async () => {
    const { user } = await mountEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/settings/google_oauth2/details');
  });

  test('should display error message on unsuccessful submission', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    SettingsAPI.updateAll.mockImplementation(() => Promise.reject(error));
    const { user } = await mountEdit();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('An error occurred')).toBeInTheDocument();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1);
  });

  test('should display ContentError on throw', async () => {
    SettingsAPI.readCategory.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    await mountEdit();
    expect(
      await screen.findByText(/Something went wrong/i)
    ).toBeInTheDocument();
  });
});
