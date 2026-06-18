import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { SettingsProvider } from 'contexts/Settings';
import { SettingsAPI } from 'api';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import mockAllOptions from '../../shared/data.allSettingOptions.json';
import OIDCEdit from './OIDCEdit';

jest.mock('../../../../api');

describe('<OIDCEdit />', () => {
  let history;

  beforeEach(() => {
    SettingsAPI.revertCategory.mockResolvedValue({});
    SettingsAPI.updateAll.mockResolvedValue({});
    SettingsAPI.readCategory.mockResolvedValue({
      data: {
        SOCIAL_AUTH_OIDC_KEY: 'mock key',
        SOCIAL_AUTH_OIDC_SECRET: '$encrypted$',
        SOCIAL_AUTH_OIDC_OIDC_ENDPOINT: 'https://example.com',
        SOCIAL_AUTH_OIDC_VERIFY_SSL: true,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function renderEdit() {
    history = createMemoryHistory({
      initialEntries: ['/settings/oidc/edit'],
    });
    const result = renderWithContexts(
      <SettingsProvider value={mockAllOptions.actions}>
        <OIDCEdit />
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
    expect(screen.getByText('OIDC Key')).toBeInTheDocument();
    expect(screen.getByText('OIDC Secret')).toBeInTheDocument();
    expect(screen.getByText('OIDC Provider URL')).toBeInTheDocument();
    expect(
      screen.getByText('Verify OIDC Provider Certificate')
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
    expect(SettingsAPI.revertCategory).toHaveBeenCalledWith('oidc');
  });

  test('should successfully send request to api on form submission', async () => {
    const { user, container } = await renderEdit();
    await user.click(
      container.querySelector(
        'button[data-ouia-component-id="SOCIAL_AUTH_OIDC_SECRET-revert"]'
      )
    );
    const keyInput = container.querySelector('#SOCIAL_AUTH_OIDC_KEY');
    await user.clear(keyInput);
    await user.type(keyInput, 'new key');
    const endpointInput = container.querySelector(
      '#SOCIAL_AUTH_OIDC_OIDC_ENDPOINT'
    );
    await user.clear(endpointInput);
    await user.type(endpointInput, 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(SettingsAPI.updateAll).toHaveBeenCalledTimes(1)
    );
    expect(SettingsAPI.updateAll).toHaveBeenCalledWith({
      SOCIAL_AUTH_OIDC_KEY: 'new key',
      SOCIAL_AUTH_OIDC_SECRET: '',
      SOCIAL_AUTH_OIDC_OIDC_ENDPOINT: 'https://example.com',
      SOCIAL_AUTH_OIDC_VERIFY_SSL: true,
    });
  });

  test('should navigate to OIDC detail on successful submission', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(history.location.pathname).toEqual('/settings/oidc/details')
    );
  });

  test('should navigate to OIDC detail when cancel is clicked', async () => {
    const { user } = await renderEdit();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toEqual('/settings/oidc/details');
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
