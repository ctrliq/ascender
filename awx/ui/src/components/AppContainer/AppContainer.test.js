import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { MeAPI, RootAPI } from 'api';
import { useAuthorizedPath } from 'contexts/Config';
import { renderWithContexts, settleTooltips } from '../../../testUtils/rtlContexts';
import AppContainer from './AppContainer';

jest.mock('../../api');
jest.mock('../../util/bootstrapPendo');

global.pendo = {
  initialize: jest.fn(),
};

describe('<AppContainer />', () => {
  const version = '222';

  beforeEach(() => {
    RootAPI.readAssetVariables.mockResolvedValue({
      data: {
        BRAND_NAME: 'AWX',
        PENDO_API_KEY: 'some-pendo-key',
      },
    });
    MeAPI.read.mockResolvedValue({ data: { results: [{}] } });
    useAuthorizedPath.mockImplementation(() => true);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test('expected content is rendered', async () => {
    const routeConfig = [
      {
        groupTitle: <span>Group One</span>,
        groupId: 'group_one',
        routes: [
          { title: 'Foo', path: '/foo' },
          { title: 'Bar', path: '/bar' },
        ],
      },
      {
        groupTitle: <span>Group Two</span>,
        groupId: 'group_two',
        routes: [{ title: 'Fiz', path: '/fiz' }],
      },
    ];

    const { container } = renderWithContexts(
      <AppContainer navRouteConfig={routeConfig}>
        {routeConfig.map(({ groupId }) => (
          <div key={groupId} id={groupId} />
        ))}
      </AppContainer>,
      {
        context: {
          config: {
            analytics_status: 'detailed',
            ansible_version: null,
            version: '9000',
            me: { is_superuser: true },
            toJSON: () => '/config/',
            license_info: {
              valid_key: true,
            },
          },
        },
      }
    );

    // page header and sidebar navigation. PF's managed sidebar starts
    // collapsed (aria-hidden) so the nav is queried from the container rather
    // than by accessibility role.
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(
      container.querySelector('nav[aria-label="Navigation"]')
    ).toBeInTheDocument();

    // sidebar groups (NavExpandableGroup, 2 expandable groups) and route links
    expect(
      container.querySelectorAll('[data-ouia-component-type="PF6/NavExpandable"]')
    ).toHaveLength(2);
    expect(screen.getByText('Group One')).toBeInTheDocument();
    expect(screen.getByText('Group Two')).toBeInTheDocument();
    expect(container.querySelector('a[href="/foo"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/bar"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/fiz"]')).toBeInTheDocument();

    // children rendered (isReady)
    expect(container.querySelector('#group_one')).toBeInTheDocument();
    expect(container.querySelector('#group_two')).toBeInTheDocument();

    await waitFor(() =>
      expect(global.pendo.initialize).toHaveBeenCalledTimes(1)
    );
  });

  test('Pendo not initialized when key is missing', async () => {
    RootAPI.readAssetVariables.mockResolvedValue({
      data: {
        BRAND_NAME: 'AWX',
        PENDO_API_KEY: '',
      },
    });
    renderWithContexts(<AppContainer />, {
      context: {
        config: {
          analytics_status: 'detailed',
          ansible_version: null,
          version: '9000',
          me: { is_superuser: true },
          toJSON: () => '/config/',
          license_info: {
            valid_key: true,
          },
        },
      },
    });
    // give the pendo identity effect a chance to run before asserting it didn't
    await waitFor(() => expect(RootAPI.readAssetVariables).toHaveBeenCalled());
    expect(global.pendo.initialize).toHaveBeenCalledTimes(0);
  });

  test('Pendo not initialized when status is analytics off', async () => {
    renderWithContexts(<AppContainer />, {
      context: {
        config: {
          analytics_status: 'off',
          ansible_version: null,
          version: '9000',
          me: { is_superuser: true },
          toJSON: () => '/config/',
          license_info: {
            valid_key: true,
          },
        },
      },
    });
    // analytics off short-circuits before readAssetVariables; allow effects to flush
    await waitFor(() => expect(screen.getByRole('banner')).toBeInTheDocument());
    expect(global.pendo.initialize).toHaveBeenCalledTimes(0);
  });

  test('opening the about modal renders prefetched config data', async () => {
    const { user } = renderWithContexts(<AppContainer />, {
      context: { config: { version } },
    });

    // open the help/about dropdown menu
    await user.click(await screen.findByRole('button', { name: 'Info' }));

    // open the about modal
    await user.click(await screen.findByText('About'));

    // check about modal content (raw textContent preserves the double spaces
    // of the speech bubble that toHaveTextContent would collapse)
    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('pre').textContent).toContain(
      `<  AWX ${version}  >`
    );

    // close the about modal
    await user.click(within(dialog).getByRole('button', { name: 'Close Dialog' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    await settleTooltips();
  });

  test('logout makes expected call to api client', async () => {
    const logout = jest.fn();
    const { user } = renderWithContexts(<AppContainer />, {
      context: {
        session: {
          logout,
        },
      },
    });

    // open the user menu
    const userToggle = document.querySelector(
      '[data-ouia-component-id="toolbar-user-dropdown-toggle"]'
    );
    await user.click(userToggle);

    // logout
    await user.click(await screen.findByText('Logout'));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
