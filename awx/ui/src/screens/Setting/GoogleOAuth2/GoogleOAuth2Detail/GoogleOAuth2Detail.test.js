import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import GoogleOAuth2Detail from './GoogleOAuth2Detail';

jest.mock('../../../../api');

// CodeEditor (react-ace) renders empty under jsdom, so for variable details we
// assert the surrounding label is present rather than the editor contents.
function assertVariableDetail(label) {
  expect(screen.getByText(label)).toBeInTheDocument();
}

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

describe('<GoogleOAuth2Detail />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValue({ data: mockSettings });
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  async function mountDetail(context) {
    renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <GoogleOAuth2Detail />
      </SettingsProvider>,
      context ? { context } : undefined
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
  }

  test('initially renders without crashing', async () => {
    await mountDetail();
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  test('should render expected tabs', async () => {
    await mountDetail();
    const expectedTabs = ['Back to Settings', 'Details'];
    screen.getAllByRole('tab').forEach((tab, index) => {
      expect(tab).toHaveTextContent(expectedTabs[index]);
    });
  });

  test('should render expected details', async () => {
    await mountDetail();
    assertDetail(
      'Google OAuth2 Callback URL',
      'https://towerhost/sso/complete/google-oauth2/'
    );
    assertDetail('Google OAuth2 Key', 'mock key');
    assertDetail('Google OAuth2 Secret', 'Encrypted');
    assertVariableDetail('Google OAuth2 Allowed Domains');
    assertVariableDetail('Google OAuth2 Extra Arguments');
    assertVariableDetail('Google OAuth2 Organization Map');
    assertVariableDetail('Google OAuth2 Team Map');
  });

  test('should hide edit button from non-superusers', async () => {
    await mountDetail({ config: { me: { is_superuser: false } } });
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });

  test('should display content error when api throws error on initial render', async () => {
    SettingsAPI.readCategory.mockRejectedValue(new Error());
    await mountDetail();
    expect(
      await screen.findByText(/Something went wrong/i)
    ).toBeInTheDocument();
  });
});
