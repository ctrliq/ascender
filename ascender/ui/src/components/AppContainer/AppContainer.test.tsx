import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { MeAPI, RootAPI } from 'api';
import { useAuthorizedPath } from 'contexts/Config';
import type { AppRouteGroup } from '../../routeConfig';
import type { ResponseOf } from '../../../testUtils/responseOf';
import {
  renderWithContexts,
  settleTooltips,
} from '../../../testUtils/rtlContexts';
import AppContainer from './AppContainer';

vi.mock('../../api');

describe('<AppContainer />', () => {
  const version = '222';

  beforeEach(() => {
    vi.mocked(RootAPI.readAssetVariables).mockResolvedValue({
      data: {
        BRAND_NAME: 'Ascender Automation',
      },
    } as unknown as ResponseOf<typeof RootAPI.readAssetVariables>);
    vi.mocked(MeAPI.read).mockResolvedValue({
      data: { results: [{}] },
    } as unknown as ResponseOf<typeof MeAPI.read>);
    vi.mocked(useAuthorizedPath).mockImplementation(() => true);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
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
      <AppContainer navRouteConfig={routeConfig as unknown as AppRouteGroup[]}>
        {routeConfig.map(({ groupId }) => (
          <div key={groupId} id={groupId} />
        ))}
      </AppContainer>,
      {
        context: {
          config: {
            ansible_version: null,
            version: '9000',
            me: { is_superuser: true },
            toJSON: () => '/config/',
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
      container.querySelectorAll(
        '[data-ouia-component-type="PF6/NavExpandable"]'
      )
    ).toHaveLength(2);
    expect(screen.getByText('Group One')).toBeInTheDocument();
    expect(screen.getByText('Group Two')).toBeInTheDocument();
    expect(container.querySelector('a[href="/foo"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/bar"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/fiz"]')).toBeInTheDocument();

    // children rendered (isReady)
    expect(container.querySelector('#group_one')).toBeInTheDocument();
    expect(container.querySelector('#group_two')).toBeInTheDocument();

    // readAssetVariables resolves after the first render and names the logo.
    // Waiting for it keeps that state update inside the test; without it React
    // lands the update after the test has ended and warns about act().
    expect(
      await screen.findAllByAltText('Ascender Automation logo')
    ).not.toHaveLength(0);
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
    expect(dialog.querySelector('pre')!.textContent).toContain(
      `<  Ascender Automation ${version}  >`
    );

    // close the about modal
    await user.click(
      within(dialog).getByRole('button', { name: 'Close Dialog' })
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    await settleTooltips();
  });

  test('logout makes expected call to api client', async () => {
    const logout = vi.fn();
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
    ) as HTMLElement;
    await user.click(userToggle);

    // logout
    await user.click(await screen.findByText('Logout'));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
