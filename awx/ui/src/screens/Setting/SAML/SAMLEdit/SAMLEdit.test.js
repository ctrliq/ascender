import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import SAMLEdit from './SAMLEdit';

jest.mock('../../../../api');

describe('<SAMLEdit />', () => {
  let history;

  beforeEach(() => {
    SettingsAPI.revertCategory.mockResolvedValue({});
    SettingsAPI.updateAll.mockResolvedValue({});
    SettingsAPI.readCategory.mockResolvedValue({
      data: {
        SAML_AUTO_CREATE_OBJECTS: true,
        SOCIAL_AUTH_SAML_CALLBACK_URL: 'https://towerhost/sso/complete/saml/',
        SOCIAL_AUTH_SAML_METADATA_URL: 'https://towerhost/sso/metadata/saml/',
        SOCIAL_AUTH_SAML_SP_ENTITY_ID: 'mock_id',
        SOCIAL_AUTH_SAML_SP_PUBLIC_CERT: 'mock_cert',
        SOCIAL_AUTH_SAML_SP_PRIVATE_KEY: '$encrypted$',
        SOCIAL_AUTH_SAML_ORG_INFO: {},
        SOCIAL_AUTH_SAML_TECHNICAL_CONTACT: {
          givenName: 'Mock User',
          emailAddress: 'mockuser@example.com',
        },
        SOCIAL_AUTH_SAML_SUPPORT_CONTACT: {},
        SOCIAL_AUTH_SAML_ENABLED_IDPS: {},
        SOCIAL_AUTH_SAML_SP_EXTRA: {},
        SOCIAL_AUTH_SAML_EXTRA_DATA: [],
        SOCIAL_AUTH_SAML_ORGANIZATION_MAP: {},
        SOCIAL_AUTH_SAML_TEAM_MAP: {},
        SOCIAL_AUTH_SAML_ORGANIZATION_ATTR: {},
        SOCIAL_AUTH_SAML_TEAM_ATTR: {},
        SOCIAL_AUTH_SAML_USER_FLAGS_BY_ATTR: {},
        SOCIAL_AUTH_SAML_SECURITY_CONFIG: {
          requestedAuthnContext: false,
        },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function renderEdit() {
    history = createMemoryHistory({
      initialEntries: ['/settings/saml/edit'],
    });
    const result = renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <SAMLEdit />
      </SettingsProvider>,
      { context: { router: { history } } }
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    return result;
  }

  test('initially renders without crashing', async () => {
    await renderEdit();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test('should display expected form fields', async () => {
    await renderEdit();
    [
      'SAML Service Provider Entity ID',
      'Automatically Create Organizations and Teams on SAML Login',
      'SAML Service Provider Public Certificate',
      'SAML Service Provider Private Key',
      'SAML Service Provider Organization Info',
      'SAML Service Provider Technical Contact',
      'SAML Service Provider Support Contact',
      'SAML Enabled Identity Providers',
      'SAML Organization Map',
      'SAML Team Map',
      'SAML Organization Attribute Mapping',
      'SAML Team Attribute Mapping',
      'SAML Security Config',
      'SAML Service Provider extra configuration data',
      'SAML IDP to extra_data attribute mapping',
    ].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  test('should successfully send default values to api on form revert all', async () => {
    const { user } = await renderEdit();
    expect(SettingsAPI.revertCategory).toHaveBeenCalledTimes(0);
    expect(screen.queryByText('Revert settings')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Revert all to default' })
    );
    expect(await screen.findByText('Revert settings')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm revert all' })
    );
    await waitFor(() =>
      expect(SettingsAPI.revertCategory).toHaveBeenCalledTimes(1)
    );
    expect(SettingsAPI.revertCategory).toHaveBeenCalledWith('saml');
  });

  test('should successfully send request to api on form submission', async () => {
    const { user, container } = await renderEdit();
    const entityIdInput = container.querySelector(
      '#SOCIAL_AUTH_SAML_SP_ENTITY_ID'
    );
    await user.clear(entityIdInput);
    await user.type(entityIdInput, 'new_id');
    await user.click(
      container.querySelector(
        'button[data-ouia-component-id="SOCIAL_AUTH_SAML_TECHNICAL_CONTACT-revert"]'
      )
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1)
    );
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      SAML_AUTO_CREATE_OBJECTS: true,
      SOCIAL_AUTH_SAML_ENABLED_IDPS: {},
      SOCIAL_AUTH_SAML_EXTRA_DATA: [],
      SOCIAL_AUTH_SAML_ORGANIZATION_ATTR: {},
      SOCIAL_AUTH_SAML_ORGANIZATION_MAP: {},
      SOCIAL_AUTH_SAML_ORG_INFO: {},
      SOCIAL_AUTH_SAML_SP_ENTITY_ID: 'new_id',
      SOCIAL_AUTH_SAML_SP_EXTRA: {},
      SOCIAL_AUTH_SAML_SP_PRIVATE_KEY: '$encrypted$',
      SOCIAL_AUTH_SAML_SP_PUBLIC_CERT: 'mock_cert',
      SOCIAL_AUTH_SAML_SUPPORT_CONTACT: {},
      SOCIAL_AUTH_SAML_TEAM_ATTR: {},
      SOCIAL_AUTH_SAML_USER_FLAGS_BY_ATTR: {},
      SOCIAL_AUTH_SAML_TEAM_MAP: {},
      SOCIAL_AUTH_SAML_TECHNICAL_CONTACT: {},
      SOCIAL_AUTH_SAML_SECURITY_CONFIG: {
        requestedAuthnContext: false,
      },
    });
  });

  test('should navigate to saml detail on successful submission', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/settings/saml/details')
    );
  });

  test('should navigate to saml detail when cancel is clicked', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/settings/saml/details');
  });

  test('should display error message on unsuccessful submission', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    SettingsAPI.updateAll.mockImplementation(() => Promise.reject(error));
    const { user } = await renderEdit();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('An error occurred')).toBeInTheDocument();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1);
  });

  test('should display ContentError on throw', async () => {
    SettingsAPI.readCategory.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    await renderEdit();
    expect(
      screen.getByText(
        'There was an error loading this content. Please reload the page.'
      )
    ).toBeInTheDocument();
  });
});
