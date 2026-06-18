import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import GitHubEdit from './GitHubEdit';

jest.mock('../../../../api');

describe('<GitHubEdit />', () => {
  let history;

  beforeEach(() => {
    SettingsAPI.revertCategory.mockResolvedValue({});
    SettingsAPI.updateAll.mockResolvedValue({});
    SettingsAPI.readCategory.mockResolvedValue({
      data: {
        SOCIAL_AUTH_GITHUB_CALLBACK_URL: 'https://foo/complete/github/',
        SOCIAL_AUTH_GITHUB_KEY: 'mock github key',
        SOCIAL_AUTH_GITHUB_SECRET: '$encrypted$',
        SOCIAL_AUTH_GITHUB_TEAM_MAP: {},
        SOCIAL_AUTH_GITHUB_ORGANIZATION_MAP: {
          Default: {
            users: true,
          },
        },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function setup() {
    history = createMemoryHistory({
      initialEntries: ['/settings/github/edit'],
    });
    const utils = renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <GitHubEdit />
      </SettingsProvider>,
      { context: { router: { history } } }
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    return utils;
  }

  test('initially renders the expected form fields', async () => {
    await setup();
    expect(screen.getByText('GitHub OAuth2 Key')).toBeInTheDocument();
    expect(screen.getByText('GitHub OAuth2 Secret')).toBeInTheDocument();
    expect(
      screen.getByText('GitHub OAuth2 Organization Map')
    ).toBeInTheDocument();
    expect(screen.getByText('GitHub OAuth2 Team Map')).toBeInTheDocument();
  });

  test('should successfully send default values to api on form revert all', async () => {
    const { user, container } = await setup();
    expect(SettingsAPI.revertCategory).toHaveBeenCalledTimes(0);
    expect(
      screen.queryByLabelText('Confirm revert all')
    ).not.toBeInTheDocument();
    await user.click(
      container.querySelector('button[aria-label="Revert all to default"]')
    );
    expect(screen.getByLabelText('Confirm revert all')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Confirm revert all'));
    expect(SettingsAPI.revertCategory).toHaveBeenCalledTimes(1);
    expect(SettingsAPI.revertCategory).toHaveBeenCalledWith('github');
  });

  test('should successfully send request to api on form submission', async () => {
    const { user, container } = await setup();
    // revert the secret back to empty via its in-field Revert button
    await user.click(
      within(
        container.querySelector('#SOCIAL_AUTH_GITHUB_SECRET-field')
      ).getByRole('button', { name: 'Revert' })
    );
    const keyInput = container.querySelector('#SOCIAL_AUTH_GITHUB_KEY');
    await user.clear(keyInput);
    await user.type(keyInput, 'new key');
    await user.click(container.querySelector('button[aria-label="Save"]'));
    await waitFor(() =>
      expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1)
    );
    // the org/team maps are unchanged from their initial values; the CodeEditor
    // (react-ace) renders empty under jsdom so it cannot be driven here, so we
    // assert the map values pass through unchanged rather than editing them.
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      SOCIAL_AUTH_GITHUB_KEY: 'new key',
      SOCIAL_AUTH_GITHUB_SECRET: '',
      SOCIAL_AUTH_GITHUB_TEAM_MAP: {},
      SOCIAL_AUTH_GITHUB_ORGANIZATION_MAP: {
        Default: {
          users: true,
        },
      },
    });
  });

  test('should navigate to github default detail on successful submission', async () => {
    const { user, container } = await setup();
    await user.click(container.querySelector('button[aria-label="Save"]'));
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/settings/github/details')
    );
  });

  test('should navigate to github default detail when cancel is clicked', async () => {
    const { user, container } = await setup();
    await user.click(container.querySelector('button[aria-label="Cancel"]'));
    expect(history.location.pathname).toEqual('/settings/github/details');
  });

  test('should display error message on unsuccessful submission', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    SettingsAPI.updateAll.mockImplementation(() => Promise.reject(error));
    const { user, container } = await setup();
    expect(screen.queryByText('An error occurred')).not.toBeInTheDocument();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    await user.click(container.querySelector('button[aria-label="Save"]'));
    await waitFor(() =>
      expect(screen.getByText('An error occurred')).toBeInTheDocument()
    );
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1);
  });

  test('should display ContentError on throw', async () => {
    SettingsAPI.readCategory.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <GitHubEdit />
      </SettingsProvider>
    );
    expect(
      await screen.findByText(/Something went wrong/)
    ).toBeInTheDocument();
  });
});
