import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import mockLDAP from '../../shared/data.ldapSettings.json';
import LDAPDetail from './LDAPDetail';

jest.mock('../../../../api');

describe('<LDAPDetail />', () => {
  beforeEach(() => {
    SettingsAPI.readCategory.mockResolvedValue({ data: mockLDAP });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function renderDetail(category = 'default', context = {}) {
    const history = createMemoryHistory({
      initialEntries: [`/settings/ldap/${category}/details`],
    });
    const result = renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <LDAPDetail />
      </SettingsProvider>,
      { context: { ...context, router: { history } } }
    );
    await waitFor(() =>
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    );
    return result;
  }

  describe('Default', () => {
    test('initially renders without crashing', async () => {
      await renderDetail();
      expect(screen.getByText('LDAP Server URI')).toBeInTheDocument();
    });

    test('should render expected tabs', async () => {
      await renderDetail();
      const expectedTabs = [
        'Back to Settings',
        'Default',
        'LDAP1',
        'LDAP2',
        'LDAP3',
        'LDAP4',
        'LDAP5',
      ];
      expectedTabs.forEach((tabName) => {
        expect(screen.getByText(tabName)).toBeInTheDocument();
      });
    });

    test('should render expected details', async () => {
      await renderDetail();
      assertDetail('LDAP Server URI', 'ldap://ldap.example.com');
      assertDetail('LDAP Bind DN', 'cn=eng_user');
      assertDetail('LDAP Bind Password', 'Encrypted');
      assertDetail('LDAP Start TLS', 'Off');
      assertDetail(
        'LDAP User DN Template',
        'uid=%(user)s,OU=Users,DC=example,DC=com'
      );
      assertDetail('LDAP Group Type', 'MemberDNGroupType');
      assertDetail(
        'LDAP Require Group',
        'CN=Service Users,OU=Users,DC=example,DC=com'
      );
      assertDetail('LDAP Deny Group', 'Not configured');
      // list/object details render via CodeEditor, which is empty under jsdom;
      // assert only that the surrounding labels are present.
      [
        'LDAP User Search',
        'LDAP User Attribute Map',
        'LDAP Group Search',
        'LDAP Group Type Parameters',
        'LDAP User Flags By Group',
        'LDAP Organization Map',
        'LDAP Team Map',
      ].forEach((label) => {
        expect(screen.getByText(label)).toBeInTheDocument();
      });
    });

    test('should hide edit button from non-superusers', async () => {
      await renderDetail('default', {
        config: { me: { is_superuser: false } },
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

  describe('Redirect', () => {
    test('should render redirect when user navigates to erroneous category', async () => {
      const { history } = await renderDetail('foo');
      await waitFor(() =>
        expect(history.location.pathname).toEqual(
          '/settings/ldap/default/details'
        )
      );
    });
  });
});
