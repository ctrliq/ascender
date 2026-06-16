import React from 'react';
import {
  screen,
  waitFor,
  within,
  fireEvent,
} from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { ConfigAPI, MeAPI, SettingsAPI, RootAPI, UsersAPI } from 'api';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import SubscriptionEdit from './SubscriptionEdit';

jest.mock('../../../../api');

const mockConfig = {
  me: {
    is_superuser: true,
  },
  license_info: {
    compliant: true,
    current_instances: 1,
    date_expired: false,
    date_warning: true,
    free_instances: 1000,
    grace_period_remaining: 2904229,
    instance_count: 1001,
    license_date: '1614401999',
    license_type: 'enterprise',
    pool_id: '123',
    product_name: 'Red Hat Ansible Automation, Standard (5000 Managed Nodes)',
    satellite: false,
    sku: 'ABC',
    subscription_name:
      'Red Hat Ansible Automation, Standard (1001 Managed Nodes)',
    support_level: null,
    time_remaining: 312229,
    trial: false,
    valid_key: true,
  },
  analytics_status: 'detailed',
  version: '1.2.3',
};

const emptyConfig = {
  me: {
    is_superuser: true,
  },
  license_info: {
    valid_key: false,
  },
  request: jest.fn(),
};

async function waitForLoaded() {
  await waitFor(() =>
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  );
}

describe('<SubscriptionEdit />', () => {
  describe('installing a fresh subscription', () => {
    let history;
    let container;

    async function renderFresh() {
      jest.resetAllMocks();
      RootAPI.readAssetVariables = async () => ({
        data: {
          BRAND_NAME: 'Mock',
          PENDO_API_KEY: '',
        },
      });
      SettingsAPI.readCategory = async () => ({ data: {} });
      history = createMemoryHistory({
        initialEntries: ['/settings/subscription_managment'],
      });
      const utils = renderWithContexts(<SubscriptionEdit />, {
        context: {
          config: emptyConfig,
          router: { history },
        },
      });
      container = utils.container;
      await waitForLoaded();
      return utils;
    }

    test('shows all wizard steps when it is a trial or fresh installation', async () => {
      await renderFresh();
      // brand-prefixed subscription step plus analytics and eula steps.
      // "Mock Subscription" appears in both the wizard nav and the active
      // step header, so allow multiple matches.
      expect(screen.getAllByText('Mock Subscription').length).toBeGreaterThan(
        0
      );
      expect(
        screen.getByText('User and Automation Analytics')
      ).toBeInTheDocument();
      expect(
        screen.getByText('End user license agreement')
      ).toBeInTheDocument();
      // no cancel button when there is no valid key
      expect(
        screen.queryByRole('button', { name: 'Cancel subscription edit' })
      ).not.toBeInTheDocument();
    });

    test('subscription selection type toggle defaults to manifest', async () => {
      await renderFresh();
      // PF ToggleGroupItem puts the id on the wrapper div and the selected
      // state (pf-m-selected / aria-pressed) on the inner button
      const manifestButton = container.querySelector(
        '#subscription-manifest button'
      );
      const credButton = container.querySelector('#username-password button');
      expect(manifestButton).toHaveTextContent('Subscription manifest');
      expect(manifestButton).toHaveClass('pf-m-selected');
      expect(credButton).toHaveTextContent('Username / password');
      expect(credButton).not.toHaveClass('pf-m-selected');
    });

    test('file upload field uploads a manifest file', async () => {
      await renderFresh();
      const filenameInput = container.querySelector(
        '#upload-manifest-filename'
      );
      expect(filenameInput.value).toEqual('');
      const fileInput = container.querySelector('input[type="file"]');
      const file = new File(['123'], 'mock.zip', { type: 'application/zip' });
      fireEvent.change(fileInput, { target: { files: [file] } });
      await waitFor(() =>
        expect(
          container.querySelector('#upload-manifest-filename').value
        ).toEqual('mock.zip')
      );
    });

    test('clicking next advances to analytics step then eula step and submits', async () => {
      const { user } = await renderFresh();

      // upload a manifest so submit is enabled
      const fileInput = container.querySelector('input[type="file"]');
      const file = new File(['123'], 'mock.zip', { type: 'application/zip' });
      fireEvent.change(fileInput, { target: { files: [file] } });
      await waitFor(() =>
        expect(
          container.querySelector('#upload-manifest-filename').value
        ).toEqual('mock.zip')
      );

      // advance to the analytics step
      fireEvent.click(container.querySelector('#subscription-wizard-next'));
      expect(await screen.findByText('User analytics')).toBeInTheDocument();
      expect(screen.getByText('Automation Analytics')).toBeInTheDocument();
      // manifest + insights enabled -> credential fields are shown
      expect(container.querySelector('#username-field')).toBeInTheDocument();
      expect(container.querySelector('#password-field')).toBeInTheDocument();

      // deselecting both analytics checkboxes hides the credential fields
      await user.click(container.querySelector('#pendo-field'));
      await user.click(container.querySelector('#insights-field'));
      await waitFor(() =>
        expect(container.querySelector('#username-field')).toBeNull()
      );
      expect(container.querySelector('#password-field')).toBeNull();

      // advance to the eula step
      fireEvent.click(container.querySelector('#subscription-wizard-next'));
      expect(
        await screen.findByText('End User License Agreement')
      ).toBeInTheDocument();
      const submit = container.querySelector('#subscription-wizard-submit');
      expect(submit).toBeInTheDocument();
      expect(submit).not.toBeDisabled();

      // submit successfully
      global.window.pendo = { initialize: async () => ({}) };
      ConfigAPI.read = async () => ({ data: mockConfig });
      MeAPI.read = async () => ({
        data: { results: [{ is_superuser: true }] },
      });
      ConfigAPI.attach = async () => ({});
      ConfigAPI.create = async () => ({ data: mockConfig });
      SettingsAPI.updateCategory = async () => ({});
      UsersAPI.readAdminOfOrganizations = async () => ({ data: {} });

      fireEvent.click(submit);
      expect(await screen.findByText('Save successful!')).toBeInTheDocument();
    });
  });

  describe('editing with a valid subscription', () => {
    let history;
    let container;

    async function renderEdit() {
      jest.resetAllMocks();
      RootAPI.readAssetVariables = async () => ({
        data: { BRAND_NAME: 'Mock', PENDO_API_KEY: '' },
      });
      SettingsAPI.readCategory = async () => ({
        data: {
          SUBSCRIPTIONS_PASSWORD: 'mock_password',
          SUBSCRIPTIONS_USERNAME: 'mock_username',
          INSIGHTS_TRACKING_STATE: false,
          PENDO: 'off',
        },
      });
      ConfigAPI.readSubscriptions = async () => ({
        data: [
          {
            subscription_name: 'mock subscription 50 instances',
            instance_count: 50,
            license_date: new Date(),
            pool_id: 999,
          },
        ],
      });
      history = createMemoryHistory({
        initialEntries: ['/settings/subscription/edit'],
      });
      const utils = renderWithContexts(<SubscriptionEdit />, {
        context: {
          config: {
            ...mockConfig,
            license_info: { valid_key: true },
            request: jest.fn(),
          },
          router: { history },
        },
      });
      container = utils.container;
      await waitForLoaded();
      return utils;
    }

    test('hides the analytics step when editing a current subscription', async () => {
      await renderEdit();
      expect(
        screen.getAllByText('Subscription Management').length
      ).toBeGreaterThan(0);
      expect(
        screen.queryByText('User and Automation Analytics')
      ).not.toBeInTheDocument();
      expect(
        screen.getByText('End user license agreement')
      ).toBeInTheDocument();
    });

    test('username/password toggle shows credential fields', async () => {
      const { user } = await renderEdit();
      const credToggle = container.querySelector('#username-password');
      expect(credToggle).not.toHaveClass('pf-m-selected');
      await user.click(
        screen.getByRole('button', { name: 'Username / password' })
      );
      const usernameInput = container.querySelector('#username-field');
      const passwordInput = container.querySelector('#password-field');
      expect(usernameInput.value).toEqual('');
      expect(passwordInput.value).toEqual('');
      fireEvent.change(usernameInput, {
        target: { value: 'username-cred', name: 'username' },
      });
      fireEvent.change(passwordInput, {
        target: { value: 'password-cred', name: 'password' },
      });
      await waitFor(() =>
        expect(container.querySelector('#username-field').value).toEqual(
          'username-cred'
        )
      );
      expect(container.querySelector('#password-field').value).toEqual(
        'password-cred'
      );
    });

    test('opens the subscription selection modal and selects a subscription', async () => {
      const { user } = await renderEdit();
      await user.click(
        screen.getByRole('button', { name: 'Username / password' })
      );
      const usernameInput = container.querySelector('#username-field');
      const passwordInput = container.querySelector('#password-field');
      fireEvent.change(usernameInput, {
        target: { value: 'username-cred', name: 'username' },
      });
      fireEvent.change(passwordInput, {
        target: { value: 'password-cred', name: 'password' },
      });
      await waitFor(() =>
        expect(container.querySelector('#username-field').value).toEqual(
          'username-cred'
        )
      );

      // open the subscription modal (button's accessible name is its
      // aria-label, "Get subscriptions")
      await user.click(
        screen.getByRole('button', { name: 'Get subscriptions' })
      );
      expect(
        await screen.findByText('mock subscription 50 instances')
      ).toBeInTheDocument();

      // select the subscription radio and confirm
      const grid = screen.getByRole('grid');
      const rows = within(grid).getAllByRole('row');
      await user.click(within(rows[1]).getByRole('radio'));
      await user.click(
        screen.getByRole('button', { name: 'Confirm selection' })
      );

      // the modal closes and the selected subscription name is shown
      await waitFor(() =>
        expect(
          screen.queryByRole('button', { name: 'Confirm selection' })
        ).not.toBeInTheDocument()
      );
      const selected = container.querySelector('#selected-subscription');
      expect(selected).toBeInTheDocument();
      expect(within(selected).getByText('mock subscription 50 instances')).toBeInTheDocument();

      // next skips the analytics step and goes straight to eula
      fireEvent.click(container.querySelector('#subscription-wizard-next'));
      expect(
        await screen.findByText('End User License Agreement')
      ).toBeInTheDocument();
      expect(screen.queryByText('User analytics')).not.toBeInTheDocument();
      const submit = container.querySelector('#subscription-wizard-submit');
      expect(submit).not.toBeDisabled();

      // submit successfully
      ConfigAPI.read = async () => ({ data: mockConfig });
      MeAPI.read = async () => ({
        data: { results: [{ is_superuser: true }] },
      });
      ConfigAPI.attach = async () => ({});
      ConfigAPI.create = async () => ({});
      UsersAPI.readAdminOfOrganizations = async () => ({ data: {} });
      fireEvent.click(submit);
      expect(await screen.findByText('Save successful!')).toBeInTheDocument();
    });

    test('navigates to subscription details on cancel', async () => {
      const { user } = await renderEdit();
      const cancel = screen.getByRole('button', {
        name: 'Cancel subscription edit',
      });
      expect(cancel).toBeInTheDocument();
      await user.click(cancel);
      expect(history.location.pathname).toEqual(
        '/settings/subscription/details'
      );
    });
  });

  test('shows a content error when asset variables fail to load', async () => {
    jest.resetAllMocks();
    RootAPI.readAssetVariables = jest.fn().mockRejectedValueOnce(new Error());
    renderWithContexts(<SubscriptionEdit />, {
      context: { config: emptyConfig },
    });
    await waitForLoaded();
    expect(
      await screen.findByText(
        'There was an error loading this content. Please reload the page.'
      )
    ).toBeInTheDocument();
  });
});
