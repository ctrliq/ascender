import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import SAMLDetail from './SAMLDetail';

jest.mock('../../../../api');

describe('<SAMLDetail />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValue({
      data: {
        SOCIAL_AUTH_SAML_CALLBACK_URL: 'https://towerhost/sso/complete/saml/',
        SOCIAL_AUTH_SAML_METADATA_URL: 'https://towerhost/sso/metadata/saml/',
        SOCIAL_AUTH_SAML_SP_ENTITY_ID: 'mock_id',
        SOCIAL_AUTH_SAML_SP_PUBLIC_CERT: 'mock_cert',
        SOCIAL_AUTH_SAML_SP_PRIVATE_KEY: '',
        SOCIAL_AUTH_SAML_ORG_INFO: {},
        SOCIAL_AUTH_SAML_TECHNICAL_CONTACT: {},
        SOCIAL_AUTH_SAML_SUPPORT_CONTACT: {},
        SOCIAL_AUTH_SAML_ENABLED_IDPS: {},
        SOCIAL_AUTH_SAML_SECURITY_CONFIG: {},
        SOCIAL_AUTH_SAML_SP_EXTRA: {},
        SOCIAL_AUTH_SAML_EXTRA_DATA: [],
        SOCIAL_AUTH_SAML_ORGANIZATION_MAP: {},
        SOCIAL_AUTH_SAML_TEAM_MAP: {},
        SOCIAL_AUTH_SAML_ORGANIZATION_ATTR: {},
        SOCIAL_AUTH_SAML_TEAM_ATTR: {},
        SOCIAL_AUTH_SAML_USER_FLAGS_BY_ATTR: {},
        SAML_AUTO_CREATE_OBJECTS: false,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function renderDetail(context) {
    const result = renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <SAMLDetail />
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
      screen.getByText('SAML Service Provider Entity ID')
    ).toBeInTheDocument();
  });

  test('should render expected details', async () => {
    await renderDetail();
    assertDetail(
      'Automatically Create Organizations and Teams on SAML Login',
      'Off'
    );
    assertDetail(
      'SAML Assertion Consumer Service (ACS) URL',
      'https://towerhost/sso/complete/saml/'
    );
    assertDetail(
      'SAML Service Provider Metadata URL',
      'https://towerhost/sso/metadata/saml/'
    );
    assertDetail('SAML Service Provider Entity ID', 'mock_id');
    assertDetail('SAML Service Provider Private Key', 'Not configured');
    // CodeEditor (certificate/object/list types) renders empty under jsdom;
    // assert the surrounding labels are present.
    expect(
      screen.getByText('SAML Service Provider Public Certificate')
    ).toBeInTheDocument();
    expect(
      screen.getByText('SAML Service Provider Organization Info')
    ).toBeInTheDocument();
    expect(
      screen.getByText('SAML Service Provider Technical Contact')
    ).toBeInTheDocument();
    expect(
      screen.getByText('SAML Service Provider Support Contact')
    ).toBeInTheDocument();
    expect(
      screen.getByText('SAML Enabled Identity Providers')
    ).toBeInTheDocument();
    expect(screen.getByText('SAML Security Config')).toBeInTheDocument();
    expect(
      screen.getByText('SAML Service Provider extra configuration data')
    ).toBeInTheDocument();
    expect(
      screen.getByText('SAML IDP to extra_data attribute mapping')
    ).toBeInTheDocument();
    expect(screen.getByText('SAML Organization Map')).toBeInTheDocument();
    expect(screen.getByText('SAML Team Map')).toBeInTheDocument();
    expect(
      screen.getByText('SAML Organization Attribute Mapping')
    ).toBeInTheDocument();
    expect(
      screen.getByText('SAML Team Attribute Mapping')
    ).toBeInTheDocument();
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
