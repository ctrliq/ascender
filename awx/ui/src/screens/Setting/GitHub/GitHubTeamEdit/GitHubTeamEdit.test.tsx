import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../../testUtils/settingOptions';
import GitHubTeamEdit from './GitHubTeamEdit';

vi.mock('../../../../api');

describe('<GitHubTeamEdit />', () => {
  let history: TestHistory;

  beforeEach(() => {
    vi.mocked(SettingsAPI.revertCategory).mockResolvedValue(
      {} as unknown as ResponseOf<typeof SettingsAPI.revertCategory>
    );
    vi.mocked(SettingsAPI.updateAll).mockResolvedValue(
      {} as unknown as ResponseOf<typeof SettingsAPI.updateAll>
    );
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: {
        SOCIAL_AUTH_GITHUB_TEAM_CALLBACK_URL:
          'https://towerhost/sso/complete/github-team/',
        SOCIAL_AUTH_GITHUB_TEAM_KEY: 'OAuth2 key (Client ID)',
        SOCIAL_AUTH_GITHUB_TEAM_SECRET: '$encrypted$',
        SOCIAL_AUTH_GITHUB_TEAM_ID: 'team_id',
        SOCIAL_AUTH_GITHUB_TEAM_ORGANIZATION_MAP: {},
        SOCIAL_AUTH_GITHUB_TEAM_TEAM_MAP: {},
      },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function setup() {
    history = createMemoryHistory({
      initialEntries: ['/settings/github/team/edit'],
    });
    const utils = renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <GitHubTeamEdit />
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
    expect(screen.getByText('GitHub Team OAuth2 Key')).toBeInTheDocument();
    expect(screen.getByText('GitHub Team OAuth2 Secret')).toBeInTheDocument();
    expect(screen.getByText('GitHub Team ID')).toBeInTheDocument();
    expect(
      screen.getByText('GitHub Team OAuth2 Organization Map')
    ).toBeInTheDocument();
    expect(screen.getByText('GitHub Team OAuth2 Team Map')).toBeInTheDocument();
  });

  test('should successfully send default values to api on form revert all', async () => {
    const { user, container } = await setup();
    expect(SettingsAPI.revertCategory).toHaveBeenCalledTimes(0);
    expect(
      screen.queryByLabelText('Confirm revert all')
    ).not.toBeInTheDocument();
    await user.click(
      container.querySelector('button[aria-label="Revert all to default"]')!
    );
    expect(screen.getByLabelText('Confirm revert all')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Confirm revert all'));
    expect(SettingsAPI.revertCategory).toHaveBeenCalledTimes(1);
    expect(SettingsAPI.revertCategory).toHaveBeenCalledWith('github-team');
  });

  test('should successfully send request to api on form submission', async () => {
    const { user, container } = await setup();
    await user.click(
      within(
        container.querySelector('#SOCIAL_AUTH_GITHUB_TEAM_SECRET-field')!
      ).getByRole('button', { name: 'Revert' })
    );
    const idInput = container.querySelector('#SOCIAL_AUTH_GITHUB_TEAM_ID');
    await user.clear(idInput!);
    await user.type(idInput!, '12345');
    await user.click(container.querySelector('button[aria-label="Save"]')!);
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    // org/team maps start as {} and are not editable in jsdom (react-ace
    // renders empty); they pass through unchanged.
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      SOCIAL_AUTH_GITHUB_TEAM_KEY: 'OAuth2 key (Client ID)',
      SOCIAL_AUTH_GITHUB_TEAM_SECRET: '',
      SOCIAL_AUTH_GITHUB_TEAM_ID: '12345',
      SOCIAL_AUTH_GITHUB_TEAM_TEAM_MAP: {},
      SOCIAL_AUTH_GITHUB_TEAM_ORGANIZATION_MAP: {},
    });
  });

  test('should navigate to github team detail on successful submission', async () => {
    const { user, container } = await setup();
    await user.click(container.querySelector('button[aria-label="Save"]')!);
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/settings/github/team/details')
    );
  });

  test('should navigate to github team detail when cancel is clicked', async () => {
    const { user, container } = await setup();
    await user.click(container.querySelector('button[aria-label="Cancel"]')!);
    expect(history.location.pathname).toEqual('/settings/github/team/details');
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
    const { user, container } = await setup();
    expect(screen.queryByText('An error occurred')).not.toBeInTheDocument();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    await user.click(container.querySelector('button[aria-label="Save"]')!);
    await waitFor(() =>
      expect(screen.getByText('An error occurred')).toBeInTheDocument()
    );
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1);
  });

  test('should display ContentError on throw', async () => {
    vi.mocked(SettingsAPI.readCategory).mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <GitHubTeamEdit />
      </SettingsProvider>
    );
    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
  });
});
