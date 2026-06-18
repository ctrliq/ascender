import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import AzureADDetail from './AzureADDetail';

jest.mock('../../../../api');
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useRouteMatch: () => ({
    path: '/settings/azure/default/details',
    params: { category: 'default' },
  }),
}));

describe('<AzureADDetail />', () => {
  beforeEach(() => {
    const mockData = {
      SOCIAL_AUTH_AZUREAD_OAUTH2_CALLBACK_URL:
        'https://towerhost/sso/complete/azuread-oauth2/',
      SOCIAL_AUTH_AZUREAD_OAUTH2_KEY: 'mock key',
      SOCIAL_AUTH_AZUREAD_OAUTH2_SECRET: '$encrypted$',
      SOCIAL_AUTH_AZUREAD_OAUTH2_ORGANIZATION_MAP: {},
      SOCIAL_AUTH_AZUREAD_OAUTH2_TEAM_MAP: {
        'My Team': {
          users: [],
        },
      },
    };
    SettingsAPI.readCategory.mockResolvedValue({
      data: mockData,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function renderDetail(context) {
    const result = renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <AzureADDetail />
      </SettingsProvider>,
      context
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    return result;
  }

  test('initially renders without crashing', async () => {
    await renderDetail();
    expect(
      screen.getByText('Azure AD OAuth2 Callback URL')
    ).toBeInTheDocument();
  });

  test('should render expected tabs', async () => {
    await renderDetail();
    const expectedTabs = [
      /Back to Settings/,
      /Azure AD Default/,
      /Azure AD Tenant/,
    ];
    expectedTabs.forEach((text) => {
      expect(
        screen.getAllByRole('tab', { name: text }).length
      ).toBeGreaterThan(0);
    });
  });

  test('should render expected details', async () => {
    await renderDetail();
    assertDetail(
      'Azure AD OAuth2 Callback URL',
      'https://towerhost/sso/complete/azuread-oauth2/'
    );
    assertDetail('Azure AD OAuth2 Key', 'mock key');
    assertDetail('Azure AD OAuth2 Secret', 'Encrypted');
    // CodeEditor renders empty under jsdom; assert the label is present.
    expect(
      screen.getByText('Azure AD OAuth2 Organization Map')
    ).toBeInTheDocument();
    expect(screen.getByText('Azure AD OAuth2 Team Map')).toBeInTheDocument();
  });

  test('should hide edit button from non-superusers', async () => {
    await renderDetail({
      context: { config: { me: { is_superuser: false } } },
    });
    expect(
      screen.queryByRole('link', { name: 'Edit' })
    ).not.toBeInTheDocument();
  });

  test('should display content error when api throws error on initial render', async () => {
    SettingsAPI.readCategory.mockRejectedValue(new Error());
    await renderDetail();
    expect(
      screen.getByText(
        'There was an error loading this content. Please reload the page.'
      )
    ).toBeInTheDocument();
  });
});
