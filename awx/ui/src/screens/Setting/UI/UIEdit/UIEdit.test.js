import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import UIEdit from './UIEdit';

jest.mock('../../../../api');

describe('<UIEdit />', () => {
  let history;

  beforeEach(() => {
    SettingsAPI.revertCategory.mockResolvedValue({});
    SettingsAPI.updateAll.mockResolvedValue({});
    SettingsAPI.readCategory.mockResolvedValue({
      data: {
        CUSTOM_LOGIN_INFO: 'mock info',
        CUSTOM_LOGO: 'data:mock/jpeg;',
        CUSTOM_TITLE: '',
        CUSTOM_HEADER_LOGO: '',
        PENDO_TRACKING_STATE: 'detailed',
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function renderEdit() {
    history = createMemoryHistory({
      initialEntries: ['/settings/ui/edit'],
    });
    const result = renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
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

  test('should display expected form fields', async () => {
    await renderEdit();
    expect(screen.getByText('Custom Login Info')).toBeInTheDocument();
    expect(screen.getByText('Custom Login Logo')).toBeInTheDocument();
    expect(
      screen.getByText('User Analytics Tracking State')
    ).toBeInTheDocument();
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
    expect(SettingsAPI.revertCategory).toHaveBeenCalledWith('ui');
  });

  test('should successfully send request to api on form submission', async () => {
    const { user, container } = await renderEdit();
    const loginInfo = container.querySelector('#CUSTOM_LOGIN_INFO');
    await user.clear(loginInfo);
    await user.type(loginInfo, 'new login info');
    await user.click(
      container.querySelector(
        'button[data-ouia-component-id="CUSTOM_LOGO-revert"]'
      )
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1)
    );
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      CUSTOM_LOGIN_INFO: 'new login info',
      CUSTOM_LOGO: '',
      CUSTOM_TITLE: '',
      CUSTOM_HEADER_LOGO: '',
      PENDO_TRACKING_STATE: 'detailed',
    });
  });

  test('should navigate to ui detail on successful submission', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/settings/ui/details')
    );
    expect(history.location.state?.hardReload).toEqual(undefined);
  });

  test('should navigate to ui detail with reload param on successful submission where PENDO_TRACKING_STATE changes', async () => {
    const { user, container } = await renderEdit();
    await user.selectOptions(
      container.querySelector('#PENDO_TRACKING_STATE'),
      'off'
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/settings/ui/details')
    );
    expect(history.location.state?.hardReload).toEqual(true);
  });

  test('should navigate to ui detail when cancel is clicked', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/settings/ui/details');
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
