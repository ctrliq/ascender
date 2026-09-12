import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import type { TestHistory } from 'history';
import { createMemoryHistory } from 'history';
import { ConfigAPI, MeAPI, SettingsAPI, RootAPI, UsersAPI } from 'api';
import type { ResponseOf } from '../../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import SubscriptionEdit from './SubscriptionEdit';

vi.mock('../../../../api');

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
  request: vi.fn(),
};

async function waitForLoaded() {
  await waitFor(() =>
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  );
}

describe('<SubscriptionEdit />', () => {
  describe('installing a fresh subscription', () => {
    let history;
    let container: HTMLElement;

    // Asserted rather than checked: a selector that matches nothing here is a
    // broken test, and the assertion that follows says so more clearly than a
    // null guard would.
    const find = (selector: string) =>
      container.querySelector(selector) as HTMLElement;
    const findInput = (selector: string) =>
      container.querySelector(selector) as HTMLInputElement;

    async function renderFresh() {
      vi.resetAllMocks();
      vi.mocked(RootAPI.readAssetVariables).mockResolvedValue({
        data: {
          BRAND_NAME: 'Mock',
          PENDO_API_KEY: '',
        },
      } as unknown as ResponseOf<typeof RootAPI.readAssetVariables>);
      vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
        data: {},
      } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
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

    test('file upload field uploads a manifest file', async () => {
      await renderFresh();
      const filenameInput = findInput('#upload-manifest-filename');
      expect(filenameInput.value).toEqual('');
      const fileInput = find('input[type="file"]');
      const file = new File(['123'], 'mock.zip', { type: 'application/zip' });
      fireEvent.change(fileInput, { target: { files: [file] } });
      await waitFor(() =>
        expect(findInput('#upload-manifest-filename').value).toEqual('mock.zip')
      );
    });

    test('clicking next advances to analytics step then eula step and submits', async () => {
      const { user } = await renderFresh();

      // upload a manifest so submit is enabled
      const fileInput = find('input[type="file"]');
      const file = new File(['123'], 'mock.zip', { type: 'application/zip' });
      fireEvent.change(fileInput, { target: { files: [file] } });
      await waitFor(() =>
        expect(findInput('#upload-manifest-filename').value).toEqual('mock.zip')
      );

      // advance to the analytics step
      fireEvent.click(find('#subscription-wizard-next'));
      expect(await screen.findByText('User analytics')).toBeInTheDocument();
      expect(screen.getByText('Automation Analytics')).toBeInTheDocument();
      // manifest + insights enabled -> credential fields are shown. The step
      // heading arrives before they do, so this waits rather than assuming the
      // whole step rendered in one go.
      await waitFor(() =>
        expect(container.querySelector('#username-field')).toBeInTheDocument()
      );
      expect(container.querySelector('#password-field')).toBeInTheDocument();

      // deselecting both analytics checkboxes hides the credential fields
      await user.click(find('#pendo-field'));
      await user.click(find('#insights-field'));
      await waitFor(() =>
        expect(container.querySelector('#username-field')).toBeNull()
      );
      expect(container.querySelector('#password-field')).toBeNull();

      // advance to the eula step
      fireEvent.click(find('#subscription-wizard-next'));
      expect(
        await screen.findByText('End User License Agreement')
      ).toBeInTheDocument();
      const submit = find('#subscription-wizard-submit');
      expect(submit).toBeInTheDocument();
      expect(submit).not.toBeDisabled();

      // submit successfully
      // The tracker the app initialises at login, which the wizard's submit
      // path reaches for; jsdom has no script tag to load it.
      (
        global.window as unknown as {
          pendo: { initialize: () => Promise<unknown> };
        }
      ).pendo = { initialize: async () => ({}) };
      vi.mocked(ConfigAPI.read).mockResolvedValue({
        data: mockConfig,
      } as unknown as ResponseOf<typeof ConfigAPI.read>);
      vi.mocked(MeAPI.read).mockResolvedValue({
        data: { results: [{ is_superuser: true }] },
      } as unknown as ResponseOf<typeof MeAPI.read>);
      vi.mocked(ConfigAPI.create).mockResolvedValue({
        data: mockConfig,
      } as unknown as ResponseOf<typeof ConfigAPI.create>);
      vi.mocked(SettingsAPI.updateCategory).mockResolvedValue(
        {} as unknown as ResponseOf<typeof SettingsAPI.updateCategory>
      );
      vi.mocked(UsersAPI.readAdminOfOrganizations).mockResolvedValue({
        data: {},
      } as unknown as ResponseOf<typeof UsersAPI.readAdminOfOrganizations>);

      fireEvent.click(submit);
      expect(await screen.findByText('Save successful!')).toBeInTheDocument();
    });
  });

  describe('editing with a valid subscription', () => {
    let history: TestHistory;

    async function renderEdit() {
      vi.resetAllMocks();
      vi.mocked(RootAPI.readAssetVariables).mockResolvedValue({
        data: { BRAND_NAME: 'Mock', PENDO_API_KEY: '' },
      } as unknown as ResponseOf<typeof RootAPI.readAssetVariables>);
      vi.mocked(SettingsAPI.readCategory).mockResolvedValue({
        data: {
          INSIGHTS_TRACKING_STATE: false,
          PENDO: 'off',
        },
      } as unknown as ResponseOf<typeof SettingsAPI.readCategory>);
      history = createMemoryHistory({
        initialEntries: ['/settings/subscription/edit'],
      });
      const utils = renderWithContexts(<SubscriptionEdit />, {
        context: {
          config: {
            ...mockConfig,
            license_info: { valid_key: true },
            request: vi.fn(),
          },
          router: { history },
        },
      });
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
    vi.resetAllMocks();
    vi.mocked(RootAPI.readAssetVariables).mockRejectedValueOnce(new Error());
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
