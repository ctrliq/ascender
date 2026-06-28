import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import mockLDAP from '../../shared/data.ldapSettings.json';
import LDAPEdit from './LDAPEdit';

jest.mock('../../../../api');

describe('<LDAPEdit />', () => {
  let history;

  beforeEach(() => {
    SettingsAPI.updateAll.mockResolvedValue({});
    SettingsAPI.readCategory.mockResolvedValue({ data: mockLDAP });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function renderEdit(category = 'default') {
    history = createMemoryHistory({
      initialEntries: [`/settings/ldap/${category}/edit`],
    });
    const result = renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <Routes>
          <Route path="/settings/ldap/:category/edit" element={<LDAPEdit />} />
          <Route
            path="/settings/ldap/:category/details"
            element={<div>LDAP detail view</div>}
          />
        </Routes>
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
    const { container } = await renderEdit();
    [
      'LDAP Server URI',
      'LDAP Bind DN',
      'LDAP Bind Password',
      'LDAP User Search',
      'LDAP User DN Template',
      'LDAP User Attribute Map',
      'LDAP Group Search',
      'LDAP Group Type',
      'LDAP Group Type Parameters',
      'LDAP Require Group',
      'LDAP Deny Group',
      'LDAP Start TLS',
      'LDAP User Flags By Group',
      'LDAP Organization Map',
      'LDAP Team Map',
    ].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    expect(container.querySelector('#AUTH_LDAP_SERVER_URI')).not.toBeNull();
    expect(container.querySelector('#AUTH_LDAP_5_SERVER_URI')).toBeNull();
  });

  test('should successfully send default values to api on form revert all', async () => {
    const { user } = await renderEdit();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    expect(screen.queryByText('Revert settings')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Revert all to default' })
    );
    expect(await screen.findByText('Revert settings')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm revert all' })
    );
    await waitFor(() =>
      expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1)
    );
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      AUTH_LDAP_BIND_DN: '',
      AUTH_LDAP_BIND_PASSWORD: '',
      AUTH_LDAP_CONNECTION_OPTIONS: {
        OPT_NETWORK_TIMEOUT: 30,
        OPT_REFERRALS: 0,
      },
      AUTH_LDAP_DENY_GROUP: null,
      AUTH_LDAP_GROUP_SEARCH: [],
      AUTH_LDAP_GROUP_TYPE: 'MemberDNGroupType',
      AUTH_LDAP_GROUP_TYPE_PARAMS: {
        member_attr: 'member',
        name_attr: 'cn',
      },
      AUTH_LDAP_ORGANIZATION_MAP: {},
      AUTH_LDAP_REQUIRE_GROUP: null,
      AUTH_LDAP_SERVER_URI: '',
      AUTH_LDAP_START_TLS: false,
      AUTH_LDAP_TEAM_MAP: {},
      AUTH_LDAP_USER_ATTR_MAP: {},
      AUTH_LDAP_USER_DN_TEMPLATE: null,
      AUTH_LDAP_USER_FLAGS_BY_GROUP: {},
      AUTH_LDAP_USER_SEARCH: [],
    });
  });

  test('should successfully send request to api on form submission', async () => {
    const { user, container } = await renderEdit();
    await user.click(
      container.querySelector(
        'button[data-ouia-component-id="AUTH_LDAP_BIND_PASSWORD-revert"]'
      )
    );
    await user.click(
      container.querySelector(
        'button[data-ouia-component-id="AUTH_LDAP_BIND_DN-revert"]'
      )
    );
    const serverUriInput = container.querySelector('#AUTH_LDAP_SERVER_URI');
    await user.clear(serverUriInput);
    await user.type(serverUriInput, 'ldap://mock.example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1)
    );
    // The AUTH_LDAP_TEAM_MAP CodeEditor cannot be driven through the DOM under
    // jsdom (react-ace renders no usable input), so the original test's
    // team-map edit is folded out: AUTH_LDAP_TEAM_MAP stays at its default {}.
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      AUTH_LDAP_BIND_DN: '',
      AUTH_LDAP_BIND_PASSWORD: '',
      AUTH_LDAP_DENY_GROUP: '',
      AUTH_LDAP_GROUP_SEARCH: [],
      AUTH_LDAP_GROUP_TYPE: 'MemberDNGroupType',
      AUTH_LDAP_GROUP_TYPE_PARAMS: { name_attr: 'cn', member_attr: 'member' },
      AUTH_LDAP_ORGANIZATION_MAP: {},
      AUTH_LDAP_REQUIRE_GROUP: 'CN=Service Users,OU=Users,DC=example,DC=com',
      AUTH_LDAP_SERVER_URI: 'ldap://mock.example.com',
      AUTH_LDAP_START_TLS: false,
      AUTH_LDAP_USER_ATTR_MAP: {},
      AUTH_LDAP_USER_DN_TEMPLATE: 'uid=%(user)s,OU=Users,DC=example,DC=com',
      AUTH_LDAP_USER_FLAGS_BY_GROUP: {},
      AUTH_LDAP_USER_SEARCH: [],
      AUTH_LDAP_TEAM_MAP: {},
    });
  });

  test('should navigate to ldap default detail on successful submission', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(history.location.pathname).toEqual(
        '/settings/ldap/default/details'
      )
    );
  });

  test('should navigate to ldap default detail when cancel is clicked', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/settings/ldap/default/details');
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

  test('should display ldap category 5 edit form', async () => {
    const { container } = await renderEdit('5');
    expect(container.querySelector('#AUTH_LDAP_SERVER_URI')).toBeNull();
    expect(container.querySelector('#AUTH_LDAP_5_SERVER_URI')).not.toBeNull();
    expect(
      container.querySelector('#AUTH_LDAP_5_SERVER_URI').value
    ).toEqual('ldap://ldap5.example.com');
  });
});
