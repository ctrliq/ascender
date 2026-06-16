import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import GitHubEnterpriseTeamEdit from './GitHubEnterpriseTeamEdit';

jest.mock('../../../../api');

describe('<GitHubEnterpriseTeamEdit />', () => {
  let history;

  beforeEach(() => {
    SettingsAPI.revertCategory.mockResolvedValue({});
    SettingsAPI.updateAll.mockResolvedValue({});
    SettingsAPI.readCategory.mockResolvedValue({
      data: {
        SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_CALLBACK_URL:
          'https://towerhost/sso/complete/github-enterprise-team/',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_URL: '',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_API_URL: '',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_KEY: '',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_SECRET: '$encrypted$',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_ID: '',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_ORGANIZATION_MAP: null,
        SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_TEAM_MAP: null,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function setup() {
    history = createMemoryHistory({
      initialEntries: ['/settings/github/enterprise_team/edit'],
    });
    const utils = renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <GitHubEnterpriseTeamEdit />
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
    expect(
      screen.getByText('GitHub Enterprise Team URL')
    ).toBeInTheDocument();
    expect(
      screen.getByText('GitHub Enterprise Team API URL')
    ).toBeInTheDocument();
    expect(
      screen.getByText('GitHub Enterprise Team OAuth2 Key')
    ).toBeInTheDocument();
    expect(
      screen.getByText('GitHub Enterprise Team OAuth2 Secret')
    ).toBeInTheDocument();
    expect(screen.getByText('GitHub Enterprise Team ID')).toBeInTheDocument();
    expect(
      screen.getByText('GitHub Enterprise Team OAuth2 Organization Map')
    ).toBeInTheDocument();
    expect(
      screen.getByText('GitHub Enterprise Team OAuth2 Team Map')
    ).toBeInTheDocument();
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
    expect(SettingsAPI.revertCategory).toHaveBeenCalledWith(
      'github-enterprise-team'
    );
  });

  test('should successfully send request to api on form submission', async () => {
    const { user, container } = await setup();
    await user.click(
      within(
        container.querySelector(
          '#SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_SECRET-field'
        )
      ).getByRole('button', { name: 'Revert' })
    );
    const urlInput = container.querySelector(
      '#SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_URL'
    );
    await user.clear(urlInput);
    await user.type(urlInput, 'https://localhost');
    await user.click(container.querySelector('button[aria-label="Save"]'));
    await waitFor(() =>
      expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1)
    );
    // org/team maps start as null and are not editable in jsdom (react-ace
    // renders empty); they pass through unchanged.
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_URL: 'https://localhost',
      SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_API_URL: '',
      SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_KEY: '',
      SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_SECRET: '',
      SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_ID: '',
      SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_TEAM_MAP: null,
      SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_ORGANIZATION_MAP: null,
    });
  });

  test('should navigate to github enterprise team detail on successful submission', async () => {
    const { user, container } = await setup();
    await user.click(container.querySelector('button[aria-label="Save"]'));
    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/settings/github/enterprise_team/details'
      )
    );
  });

  test('should navigate to github enterprise team detail when cancel is clicked', async () => {
    const { user, container } = await setup();
    await user.click(container.querySelector('button[aria-label="Cancel"]'));
    expect(history.location.pathname).toEqual(
      '/settings/github/enterprise_team/details'
    );
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
        <GitHubEnterpriseTeamEdit />
      </SettingsProvider>
    );
    expect(
      await screen.findByText(/Something went wrong/)
    ).toBeInTheDocument();
  });
});
