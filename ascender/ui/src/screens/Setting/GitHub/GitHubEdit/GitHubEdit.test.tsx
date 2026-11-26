import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../../testUtils/settingOptions';
import GitHubEdit from './GitHubEdit';

vi.mock('../../../../api');

describe('<GitHubEdit />', () => {
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
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function setup() {
    history = createMemoryHistory({
      initialEntries: ['/authentication/github/edit'],
    });
    const utils = renderWithContexts(
      <SettingsProvider value={settingOptions}>
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
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    expect(
      screen.queryByLabelText('Confirm revert all')
    ).not.toBeInTheDocument();
    await user.click(
      container.querySelector('button[aria-label="Revert All to Default"]')!
    );
    expect(screen.getByLabelText('Confirm revert all')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Confirm revert all'));
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    // Only the settings this page shows, each at its default: a DELETE on
    // the category would reset what the page does not show as well.
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      SOCIAL_AUTH_GITHUB_KEY: '',
      SOCIAL_AUTH_GITHUB_SECRET: '',
      SOCIAL_AUTH_GITHUB_TEAM_MAP: null,
      SOCIAL_AUTH_GITHUB_ORGANIZATION_MAP: null,
    });
    expect(SettingsAPI.revertCategory).not.toHaveBeenCalled();
  });

  test('should successfully send request to api on form submission', async () => {
    const { user, container } = await setup();
    // revert the secret back to empty via its in-field Revert button
    await user.click(
      within(
        container.querySelector('#SOCIAL_AUTH_GITHUB_SECRET-field')!
      ).getByRole('button', { name: 'Revert' })
    );
    const keyInput = container.querySelector('#SOCIAL_AUTH_GITHUB_KEY');
    await user.clear(keyInput!);
    await user.type(keyInput!, 'new key');
    await user.click(container.querySelector('button[aria-label="Save"]')!);
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    // this test edits no org/team map, so both pass through unchanged
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
    await user.click(container.querySelector('button[aria-label="Save"]')!);
    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/authentication/github/default/details'
      )
    );
  });

  test('should navigate to github default detail when cancel is clicked', async () => {
    const { user, container } = await setup();
    await user.click(container.querySelector('button[aria-label="Cancel"]')!);
    expect(history.location.pathname).toEqual(
      '/authentication/github/default/details'
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
        <GitHubEdit />
      </SettingsProvider>
    );
    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
  });
});
