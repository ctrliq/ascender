import React from 'react';
import { Routes, Route } from 'react-router';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import GitHubDetail from './GitHubDetail';

jest.mock('../../../../api');

const mockDefault = {
  data: {
    SOCIAL_AUTH_GITHUB_CALLBACK_URL: 'https://towerhost/sso/complete/github/',
    SOCIAL_AUTH_GITHUB_KEY: 'mock github key',
    SOCIAL_AUTH_GITHUB_SECRET: '$encrypted$',
    SOCIAL_AUTH_GITHUB_ORGANIZATION_MAP: null,
    SOCIAL_AUTH_GITHUB_TEAM_MAP: null,
  },
};
const mockOrg = {
  data: {
    SOCIAL_AUTH_GITHUB_ORG_CALLBACK_URL:
      'https://towerhost/sso/complete/github-org/',
    SOCIAL_AUTH_GITHUB_ORG_KEY: '',
    SOCIAL_AUTH_GITHUB_ORG_SECRET: '$encrypted$',
    SOCIAL_AUTH_GITHUB_ORG_NAME: '',
    SOCIAL_AUTH_GITHUB_ORG_ORGANIZATION_MAP: null,
    SOCIAL_AUTH_GITHUB_ORG_TEAM_MAP: null,
  },
};
const mockTeam = {
  data: {
    SOCIAL_AUTH_GITHUB_TEAM_CALLBACK_URL:
      'https://towerhost/sso/complete/github-team/',
    SOCIAL_AUTH_GITHUB_TEAM_KEY: 'OAuth2 key (Client ID)',
    SOCIAL_AUTH_GITHUB_TEAM_SECRET: '$encrypted$',
    SOCIAL_AUTH_GITHUB_TEAM_ID: 'team_id',
    SOCIAL_AUTH_GITHUB_TEAM_ORGANIZATION_MAP: {},
    SOCIAL_AUTH_GITHUB_TEAM_TEAM_MAP: {},
  },
};
const mockEnterprise = {
  data: {
    SOCIAL_AUTH_GITHUB_ENTERPRISE_CALLBACK_URL:
      'https://towerhost/sso/complete/github-enterprise/',
    SOCIAL_AUTH_GITHUB_ENTERPRISE_URL: 'https://localhost/enterpriseurl',
    SOCIAL_AUTH_GITHUB_ENTERPRISE_API_URL: 'https://localhost/enterpriseapi',
    SOCIAL_AUTH_GITHUB_ENTERPRISE_KEY: 'foobar',
    SOCIAL_AUTH_GITHUB_ENTERPRISE_SECRET: '$encrypted$',
    SOCIAL_AUTH_GITHUB_ENTERPRISE_ORGANIZATION_MAP: null,
    SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_MAP: null,
  },
};
const mockEnterpriseOrg = {
  data: {
    SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_CALLBACK_URL:
      'https://towerhost/sso/complete/github-enterprise-org/',
    SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_URL: 'https://localhost/orgurl',
    SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_API_URL: 'https://localhost/orgapi',
    SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_KEY: 'foobar',
    SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_SECRET: '$encrypted$',
    SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_NAME: 'foo',
    SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_ORGANIZATION_MAP: null,
    SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_TEAM_MAP: null,
  },
};
const mockEnterpriseTeam = {
  data: {
    SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_CALLBACK_URL:
      'https://towerhost/sso/complete/github-enterprise-team/',
    SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_URL: 'https://localhost/teamurl',
    SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_API_URL: 'https://localhost/teamapi',
    SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_KEY: 'foobar',
    SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_SECRET: '$encrypted$',
    SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_ID: 'foo',
    SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_ORGANIZATION_MAP: null,
    SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_TEAM_MAP: null,
  },
};

function mockAllCategories() {
  SettingsAPI.readCategory.mockResolvedValueOnce(mockDefault);
  SettingsAPI.readCategory.mockResolvedValueOnce(mockOrg);
  SettingsAPI.readCategory.mockResolvedValueOnce(mockTeam);
  SettingsAPI.readCategory.mockResolvedValueOnce(mockEnterprise);
  SettingsAPI.readCategory.mockResolvedValueOnce(mockEnterpriseOrg);
  SettingsAPI.readCategory.mockResolvedValueOnce(mockEnterpriseTeam);
}

async function setup(category, context) {
  const history = createMemoryHistory({
    initialEntries: [`/settings/github/${category}/details`],
  });
  const mergedContext = {
    ...context,
    router: { history, ...context?.router },
  };
  const utils = renderWithContexts(
    <Routes>
      <Route
        path="/settings/github/:category/details"
        element={
          <SettingsProvider value={mockAllOptions.actions}>
            <GitHubDetail />
          </SettingsProvider>
        }
      />
    </Routes>,
    { context: mergedContext }
  );
  await waitFor(() =>
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  );
  return utils;
}

describe('<GitHubDetail />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Default', () => {
    beforeEach(() => {
      mockAllCategories();
    });

    test('should render expected tabs', async () => {
      await setup('default');
      const expectedTabs = [
        'Back to Settings',
        'GitHub Default',
        'GitHub Organization',
        'GitHub Team',
        'GitHub Enterprise',
        'GitHub Enterprise Organization',
        'GitHub Enterprise Team',
      ];
      expectedTabs.forEach((tab) => {
        expect(screen.getByText(tab)).toBeInTheDocument();
      });
    });

    test('should render expected details', async () => {
      await setup('default');
      assertDetail(
        'GitHub OAuth2 Callback URL',
        'https://towerhost/sso/complete/github/'
      );
      assertDetail('GitHub OAuth2 Key', 'mock github key');
      assertDetail('GitHub OAuth2 Secret', 'Encrypted');
      expect(
        screen.getByText('GitHub OAuth2 Organization Map')
      ).toBeInTheDocument();
      expect(screen.getByText('GitHub OAuth2 Team Map')).toBeInTheDocument();
    });

    test('should hide edit button from non-superusers', async () => {
      await setup('default', { config: { me: { is_superuser: false } } });
      expect(
        screen.queryByRole('button', { name: 'Edit' })
      ).not.toBeInTheDocument();
    });

    test('should display content error when api throws error on initial render', async () => {
      SettingsAPI.readCategory.mockReset();
      SettingsAPI.readCategory.mockRejectedValue(new Error());
      await setup('default');
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });
  });

  describe('Organization', () => {
    beforeEach(() => {
      mockAllCategories();
    });

    test('should render expected details', async () => {
      await setup('organization');
      assertDetail(
        'GitHub Organization OAuth2 Callback URL',
        'https://towerhost/sso/complete/github-org/'
      );
      assertDetail('GitHub Organization OAuth2 Key', 'Not configured');
      assertDetail('GitHub Organization OAuth2 Secret', 'Encrypted');
      assertDetail('GitHub Organization Name', 'Not configured');
      expect(
        screen.getByText('GitHub Organization OAuth2 Organization Map')
      ).toBeInTheDocument();
      expect(
        screen.getByText('GitHub Organization OAuth2 Team Map')
      ).toBeInTheDocument();
    });
  });

  describe('Team', () => {
    beforeEach(() => {
      mockAllCategories();
    });

    test('should render expected details', async () => {
      await setup('team');
      assertDetail(
        'GitHub Team OAuth2 Callback URL',
        'https://towerhost/sso/complete/github-team/'
      );
      assertDetail('GitHub Team OAuth2 Key', 'OAuth2 key (Client ID)');
      assertDetail('GitHub Team OAuth2 Secret', 'Encrypted');
      assertDetail('GitHub Team ID', 'team_id');
      expect(
        screen.getByText('GitHub Team OAuth2 Organization Map')
      ).toBeInTheDocument();
      expect(
        screen.getByText('GitHub Team OAuth2 Team Map')
      ).toBeInTheDocument();
    });
  });

  describe('Enterprise', () => {
    beforeEach(() => {
      mockAllCategories();
    });

    test('should render expected details', async () => {
      await setup('enterprise');
      assertDetail(
        'GitHub Enterprise OAuth2 Callback URL',
        'https://towerhost/sso/complete/github-enterprise/'
      );
      assertDetail('GitHub Enterprise URL', 'https://localhost/enterpriseurl');
      assertDetail(
        'GitHub Enterprise API URL',
        'https://localhost/enterpriseapi'
      );
      assertDetail('GitHub Enterprise OAuth2 Key', 'foobar');
      assertDetail('GitHub Enterprise OAuth2 Secret', 'Encrypted');
      expect(
        screen.getByText('GitHub Enterprise OAuth2 Organization Map')
      ).toBeInTheDocument();
      expect(
        screen.getByText('GitHub Enterprise OAuth2 Team Map')
      ).toBeInTheDocument();
    });
  });

  describe('Enterprise Org', () => {
    beforeEach(() => {
      mockAllCategories();
    });

    test('should render expected details', async () => {
      await setup('enterprise_organization');
      assertDetail(
        'GitHub Enterprise Organization OAuth2 Callback URL',
        'https://towerhost/sso/complete/github-enterprise-org/'
      );
      assertDetail(
        'GitHub Enterprise Organization URL',
        'https://localhost/orgurl'
      );
      assertDetail(
        'GitHub Enterprise Organization API URL',
        'https://localhost/orgapi'
      );
      assertDetail('GitHub Enterprise Organization OAuth2 Key', 'foobar');
      assertDetail('GitHub Enterprise Organization OAuth2 Secret', 'Encrypted');
      assertDetail('GitHub Enterprise Organization Name', 'foo');
      expect(
        screen.getByText(
          'GitHub Enterprise Organization OAuth2 Organization Map'
        )
      ).toBeInTheDocument();
      expect(
        screen.getByText('GitHub Enterprise Organization OAuth2 Team Map')
      ).toBeInTheDocument();
    });
  });

  describe('Enterprise Team', () => {
    beforeEach(() => {
      mockAllCategories();
    });

    test('should render expected details', async () => {
      await setup('enterprise_team');
      assertDetail(
        'GitHub Enterprise Team OAuth2 Callback URL',
        'https://towerhost/sso/complete/github-enterprise-team/'
      );
      assertDetail('GitHub Enterprise Team URL', 'https://localhost/teamurl');
      assertDetail(
        'GitHub Enterprise Team API URL',
        'https://localhost/teamapi'
      );
      assertDetail('GitHub Enterprise Team OAuth2 Key', 'foobar');
      assertDetail('GitHub Enterprise Team OAuth2 Secret', 'Encrypted');
      assertDetail('GitHub Enterprise Team ID', 'foo');
      expect(
        screen.getByText('GitHub Enterprise Team OAuth2 Organization Map')
      ).toBeInTheDocument();
      expect(
        screen.getByText('GitHub Enterprise Team OAuth2 Team Map')
      ).toBeInTheDocument();
    });
  });

  describe('Redirect', () => {
    test('should redirect when user navigates to erroneous category', async () => {
      mockAllCategories();
      const history = createMemoryHistory({
        initialEntries: ['/settings/github/foo/details'],
      });
      renderWithContexts(
        <Routes>
          <Route
            path="/settings/github/:category/details"
            element={
              <SettingsProvider value={mockAllOptions.actions}>
                <GitHubDetail />
              </SettingsProvider>
            }
          />
        </Routes>,
        { context: { router: { history } } }
      );
      await waitFor(() =>
        expect(history.location.pathname).toEqual(
          '/settings/github/default/details'
        )
      );
    });
  });
});
