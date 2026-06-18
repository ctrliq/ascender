import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import TACACSEdit from './TACACSEdit';

jest.mock('../../../../api/');

describe('<TACACSEdit />', () => {
  let history;

  beforeEach(() => {
    SettingsAPI.revertCategory.mockResolvedValue({});
    SettingsAPI.updateAll.mockResolvedValue({});
    SettingsAPI.readCategory.mockResolvedValue({
      data: {
        TACACSPLUS_HOST: 'mockhost',
        TACACSPLUS_PORT: 49,
        TACACSPLUS_SECRET: '$encrypted$',
        TACACSPLUS_SESSION_TIMEOUT: 123,
        TACACSPLUS_AUTH_PROTOCOL: 'ascii',
        TACACSPLUS_REM_ADDR: false,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function renderEdit() {
    history = createMemoryHistory({
      initialEntries: ['/settings/tacacs/edit'],
    });
    const result = renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <TACACSEdit />
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
    expect(screen.getByText('TACACS+ Server')).toBeInTheDocument();
    expect(screen.getByText('TACACS+ Port')).toBeInTheDocument();
    expect(screen.getByText('TACACS+ Secret')).toBeInTheDocument();
    expect(
      screen.getByText('TACACS+ Auth Session Timeout')
    ).toBeInTheDocument();
    expect(
      screen.getByText('TACACS+ Authentication Protocol')
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
    expect(SettingsAPI.revertCategory).toHaveBeenCalledWith('tacacsplus');
  });

  test('should successfully send request to api on form submission', async () => {
    const { user, container } = await renderEdit();
    const hostInput = container.querySelector('#TACACSPLUS_HOST');
    await user.clear(hostInput);
    await user.type(hostInput, 'new_host');
    const portInput = container.querySelector('#TACACSPLUS_PORT');
    await user.clear(portInput);
    await user.type(portInput, '999');
    await user.click(
      container.querySelector(
        'button[data-ouia-component-id="TACACSPLUS_SECRET-revert"]'
      )
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1)
    );
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      TACACSPLUS_HOST: 'new_host',
      TACACSPLUS_PORT: 999,
      TACACSPLUS_SECRET: '',
      TACACSPLUS_SESSION_TIMEOUT: 123,
      TACACSPLUS_AUTH_PROTOCOL: 'ascii',
      TACACSPLUS_REM_ADDR: false,
    });
  });

  test('should navigate to tacacs detail on successful submission', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/settings/tacacs/details')
    );
  });

  test('should navigate to tacacs detail when cancel is clicked', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/settings/tacacs/details');
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
