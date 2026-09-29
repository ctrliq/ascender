import React from 'react';
import { I18nProvider } from '@lingui/react';
import { i18n } from '@lingui/core';
import { render, screen, waitFor } from '@testing-library/react';
import {
  ConfigAPI,
  MeAPI,
  OrganizationsAPI,
  RootAPI,
  SettingsAPI,
  UsersAPI,
} from 'api';
import { dynamicActivate } from 'i18nLoader';
import { setCustomTheme } from 'themeRegistry';
import { MAX_ROWS_STORAGE_KEY } from 'components/CodeEditor/constants';
import { applyAccountTheme } from '../accountTheme';
import { messages as englishMessages } from '../locales/en/messages';

vi.mock('api');
vi.mock('i18nLoader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('i18nLoader')>()),
  dynamicActivate: vi.fn(),
}));
vi.mock('themeRegistry', () => ({ setCustomTheme: vi.fn() }));
vi.mock('../accountTheme', () => ({ applyAccountTheme: vi.fn() }));

// The shared setup replaces this context with a stub for every other test, so
// the provider under test here is the real one, asked for by name.
const { ConfigProvider, useConfig } =
  await vi.importActual<typeof import('./Config')>('./Config');

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

function Probe() {
  const config = useConfig();
  return <p>{config.me ? `loaded ${config.version}` : 'loading'}</p>;
}

describe('ConfigProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    i18n.load({ en: englishMessages });
    i18n.activate('en');
    mocked(ConfigAPI.read).mockResolvedValue({
      data: {
        version: '25.5.1',
        default_ui_theme: 'custom',
        default_ui_language: 'fr',
        max_ui_editor_rows: 20,
        custom_theme: 'html[data-theme="custom"] body { color: red; }',
        custom_theme_name: 'Red',
      },
    });
    // An ordinary user: not a superuser, not a system auditor, no language.
    mocked(MeAPI.read).mockResolvedValue({
      data: { results: [{ id: 7, username: 'rando' }] },
    });
    mocked(RootAPI.read).mockResolvedValue({ data: {} });
    mocked(UsersAPI.readAdminOfOrganizations).mockResolvedValue({
      data: { count: 0 },
    });
    mocked(OrganizationsAPI.read).mockResolvedValue({ data: { count: 0 } });
  });

  // /api/v2/settings/ui/ refuses anyone who is not an administrator or a
  // system auditor, so a user like this one only ever saw the installation's
  // defaults if they came from somewhere else. /api/v2/config/ is that place.
  test('applies the installation defaults from the config for a non-admin', async () => {
    render(
      <I18nProvider i18n={i18n}>
        <ConfigProvider>
          <Probe />
        </ConfigProvider>
      </I18nProvider>
    );
    await screen.findByText('loaded 25.5.1');

    expect(SettingsAPI.readCategory).not.toHaveBeenCalled();
    expect(SettingsAPI.readSystem).not.toHaveBeenCalled();
    expect(setCustomTheme).toHaveBeenCalledWith(
      'html[data-theme="custom"] body { color: red; }',
      'Red'
    );
    expect(applyAccountTheme).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
      'custom'
    );
    expect(localStorage.getItem('default_theme')).toBe('custom');
    expect(localStorage.getItem('default_language')).toBe('fr');
    expect(localStorage.getItem(MAX_ROWS_STORAGE_KEY)).toBe('20');
    await waitFor(() => expect(dynamicActivate).toHaveBeenCalledWith('fr'));
  });
});
