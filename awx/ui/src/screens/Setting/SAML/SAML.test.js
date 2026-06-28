import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { createMemoryHistory } from 'history';
import { SettingsAPI } from 'api';
import { SettingsProvider } from 'contexts/Settings';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import mockAllOptions from '../shared/data.allSettingOptions.json';
import SAML from './SAML';

jest.mock('../../../api');

describe('<SAML />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValue({
      data: {
        SOCIAL_AUTH_SAML_CALLBACK_URL: 'https://towerhost/sso/complete/saml/',
        SOCIAL_AUTH_SAML_METADATA_URL: 'https://towerhost/sso/metadata/saml/',
        SOCIAL_AUTH_SAML_SP_ENTITY_ID: '',
        SOCIAL_AUTH_SAML_SP_PUBLIC_CERT: '',
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

  function renderSAML(initialEntries) {
    const history = createMemoryHistory({ initialEntries });
    return renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <Routes>
          <Route path="/settings/saml/*" element={<SAML />} />
        </Routes>
      </SettingsProvider>,
      { context: { router: { history } } }
    );
  }

  test('should render SAML details', async () => {
    renderSAML(['/settings/saml/details']);
    expect(
      await screen.findByText('SAML Service Provider Entity ID')
    ).toBeInTheDocument();
  });

  test('should render SAML edit', async () => {
    renderSAML(['/settings/saml/edit']);
    expect(
      await screen.findByRole('button', { name: 'Save' })
    ).toBeInTheDocument();
  });

  test('should show content error when user navigates to erroneous route', async () => {
    renderSAML(['/settings/saml/foo']);
    await waitFor(() =>
      expect(
        screen.getByText(/The page you requested could not be found/)
      ).toBeInTheDocument()
    );
  });
});
