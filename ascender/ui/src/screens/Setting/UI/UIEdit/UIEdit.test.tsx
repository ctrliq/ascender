import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import { settingOptions } from '../../../../../testUtils/settingOptions';
import UIEdit from './UIEdit';

vi.mock('../../../../api');

describe('<UIEdit />', () => {
  let history: TestHistory;

  beforeEach(() => {
    vi.mocked(SettingsAPI.revertCategory).mockResolvedValue(
      {} as unknown as ResponseOf<typeof SettingsAPI.revertCategory>
    );
    vi.mocked(SettingsAPI.updateAll).mockResolvedValue(
      {} as unknown as ResponseOf<typeof SettingsAPI.updateAll>
    );
    vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
      data: {
        CUSTOM_LOGIN_INFO: 'mock info',
        CUSTOM_LOGO: 'data:mock/jpeg;',
        CUSTOM_TITLE: '',
        CUSTOM_HEADER_LOGO: '',
        CUSTOM_THEME: 'html[data-theme="custom"] { --x: #fff; }',
        CUSTOM_THEME_NAME: 'Mock Theme',
        DEFAULT_UI_THEME: 'default',
        DEFAULT_UI_LANGUAGE: '',
        UI_LIVE_UPDATES_ENABLED: true,
        MAX_UI_JOB_EVENTS: 4000,
      },
    } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // One tab, one page: a test names the group whose fields it is after.
  async function renderEdit(group = 'login') {
    history = createMemoryHistory({
      initialEntries: [`/appearance/edit/${group}`],
    });
    const result = renderWithContexts(
      <SettingsProvider value={settingOptions}>
        <UIEdit />
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

  test('should display the fields of the group being edited', async () => {
    await renderEdit();
    expect(screen.getByText('Custom Login Info')).toBeInTheDocument();
    expect(screen.getByText('Custom Login Logo')).toBeInTheDocument();
    expect(screen.queryByText('Default Theme')).not.toBeInTheDocument();
  });

  test('should display the theme fields on the theme group', async () => {
    await renderEdit('theme');
    expect(screen.getByText('Default Theme')).toBeInTheDocument();
    expect(screen.getByText('Custom Theme Name')).toBeInTheDocument();
    expect(screen.getByText('Custom Theme CSS File')).toBeInTheDocument();
  });

  test('should display the miscellaneous fields on that group', async () => {
    await renderEdit('misc');
    expect(
      screen.getByText('Max Job Events Retrieved by UI')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Enable Live Updates in the UI')
    ).toBeInTheDocument();
  });

  test('should successfully send default values to api on form revert all', async () => {
    const { user } = await renderEdit();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    expect(screen.queryByText('Revert Settings')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Revert All to Default' })
    );
    expect(await screen.findByText('Revert Settings')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm revert all' })
    );
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    // Only the settings this page shows, each at its default: a DELETE on
    // the category would reset what the page does not show as well.
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      CUSTOM_LOGIN_INFO: '',
      CUSTOM_LOGO: '',
    });
    expect(SettingsAPI.revertCategory).not.toHaveBeenCalled();
  });

  test('should successfully send request to api on form submission', async () => {
    const { user, container } = await renderEdit();
    const loginInfo = container.querySelector('#CUSTOM_LOGIN_INFO');
    await user.clear(loginInfo!);
    await user.type(loginInfo!, 'new login info');
    await user.click(
      container.querySelector(
        'button[data-ouia-component-id="CUSTOM_LOGO-revert"]'
      )!
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    // The login tab's own two settings, and none of the other tabs'.
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      CUSTOM_LOGIN_INFO: 'new login info',
      CUSTOM_LOGO: '',
    });
  });

  test('should save only the settings of the tab being edited', async () => {
    const { user } = await renderEdit('misc');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1));
    expect(
      Object.keys(
        vi.mocked(SettingsAPI.updateAll).mock.calls[0]![0] as Record<
          string,
          unknown
        >
      ).sort()
    ).toEqual([
      'MAX_UI_EDITOR_ROWS',
      'MAX_UI_JOB_EVENTS',
      'UI_LIVE_UPDATES_ENABLED',
    ]);
  });

  test('should navigate to ui detail on successful submission', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    // Back on the tab that was edited rather than the first one.
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/appearance/login')
    );
    expect(history.location.state?.hardReload).toEqual(undefined);
  });

  test('should navigate to ui detail when cancel is clicked', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/appearance/login');
  });

  test('should display error message on unsuccessful submission', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    vi.mocked(SettingsAPI.updateAll).mockImplementation(() =>
      Promise.reject(error)
    );
    const { user } = await renderEdit();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(0);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('An error occurred')).toBeInTheDocument();
    expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1);
  });

  test('should display ContentError on throw', async () => {
    vi.mocked(SettingsAPI.readCategory).mockImplementationOnce(() =>
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
