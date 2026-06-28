import React from 'react';
import { Routes, Route } from 'react-router';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { SettingsAPI } from 'api';
import { SettingsProvider } from 'contexts/Settings';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockAllOptions from '../shared/data.allSettingOptions.json';
import GitHub from './GitHub';

jest.mock('../../../api/models/Settings');

async function setup(initialEntry) {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const utils = renderWithContexts(
    <SettingsProvider value={mockAllOptions.actions}>
      <Routes>
        <Route path="/settings/github/*" element={<GitHub />} />
      </Routes>
    </SettingsProvider>,
    { context: { router: { history } } }
  );
  return { history, ...utils };
}

describe('<GitHub />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValueOnce({
      data: {
        SOCIAL_AUTH_GITHUB_CALLBACK_URL:
          'https://towerhost/sso/complete/github/',
        SOCIAL_AUTH_GITHUB_KEY: 'mock github key',
        SOCIAL_AUTH_GITHUB_SECRET: '$encrypted$',
        SOCIAL_AUTH_GITHUB_ORGANIZATION_MAP: null,
        SOCIAL_AUTH_GITHUB_TEAM_MAP: null,
      },
    });
    SettingsAPI.readCategory.mockResolvedValueOnce({
      data: {
        SOCIAL_AUTH_GITHUB_ORG_CALLBACK_URL:
          'https://towerhost/sso/complete/github-org/',
        SOCIAL_AUTH_GITHUB_ORG_KEY: '',
        SOCIAL_AUTH_GITHUB_ORG_SECRET: '$encrypted$',
        SOCIAL_AUTH_GITHUB_ORG_NAME: '',
        SOCIAL_AUTH_GITHUB_ORG_ORGANIZATION_MAP: null,
        SOCIAL_AUTH_GITHUB_ORG_TEAM_MAP: null,
      },
    });
    SettingsAPI.readCategory.mockResolvedValueOnce({
      data: {
        SOCIAL_AUTH_GITHUB_TEAM_CALLBACK_URL:
          'https://towerhost/sso/complete/github-team/',
        SOCIAL_AUTH_GITHUB_TEAM_KEY: 'OAuth2 key (Client ID)',
        SOCIAL_AUTH_GITHUB_TEAM_SECRET: '$encrypted$',
        SOCIAL_AUTH_GITHUB_TEAM_ID: 'team_id',
        SOCIAL_AUTH_GITHUB_TEAM_ORGANIZATION_MAP: {},
        SOCIAL_AUTH_GITHUB_TEAM_TEAM_MAP: {},
      },
    });
    SettingsAPI.readCategory.mockResolvedValueOnce({
      data: {
        SOCIAL_AUTH_GITHUB_ENTERPRISE_CALLBACK_URL:
          'https://towerhost/sso/complete/github-enterprise/',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_URL: 'https://localhost/url',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_API_URL: 'https://localhost/apiurl',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_KEY: 'ent_key',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_SECRET: '$encrypted',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_ORGANIZATION_MAP: {},
        SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_MAP: {},
      },
    });
    SettingsAPI.readCategory.mockResolvedValueOnce({
      data: {
        SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_CALLBACK_URL:
          'https://towerhost/sso/complete/github-enterprise-org/',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_URL: 'https://localhost/url',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_API_URL: 'https://localhost/apiurl',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_KEY: 'ent_org_key',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_SECRET: '$encrypted$',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_NAME: 'ent_org_name',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_ORGANIZATION_MAP: {},
        SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_TEAM_MAP: {},
      },
    });
    SettingsAPI.readCategory.mockResolvedValueOnce({
      data: {
        SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_CALLBACK_URL:
          'https://towerhost/sso/complete/github-enterprise-team/',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_URL: 'https://localhost/url',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_API_URL: 'https://localhost/apiurl',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_KEY: 'ent_team_key',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_SECRET: '$encrypted$',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_ID: 'ent_team_id',
        SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_ORGANIZATION_MAP: {},
        SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_TEAM_MAP: {},
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render github default details', async () => {
    await setup('/settings/github/');
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    expect(await screen.findByText('GitHub OAuth2 Key')).toBeInTheDocument();
  });

  test('should redirect to github organization category details', async () => {
    await setup('/settings/github/organization');
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    expect(
      await screen.findByText('GitHub Organization OAuth2 Key')
    ).toBeInTheDocument();
  });

  test('should render github edit', async () => {
    await setup('/settings/github/default/edit');
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    // the edit form exposes a Save button; the detail view does not
    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });

  test('should show content error when user navigates to erroneous route', async () => {
    await setup('/settings/github/foo/bar');
    expect(
      await screen.findByText(/The page you requested could not be found/)
    ).toBeInTheDocument();
  });
});
