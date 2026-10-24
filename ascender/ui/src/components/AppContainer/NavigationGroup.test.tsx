import React from 'react';
import { act, screen } from '@testing-library/react';
import { Nav, NavList } from '@patternfly/react-core';
import { createMemoryHistory } from '../../../testUtils/historyShim';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import NavigationGroup, { openingMs } from './NavigationGroup';

const STORAGE_KEY = 'ascender.nav.collapsedGroups';

const routes = [
  { title: 'Approvals', path: '/approvals', hasApprovalBadge: true },
  { title: 'Runs', path: '/runs' },
  {
    title: 'Credential types',
    path: '/credential_types',
    isHiddenFromNav: true,
  },
];

function renderGroup(props = {}) {
  return renderWithContexts(
    <Nav aria-label="Navigation">
      <NavList>
        <NavigationGroup
          groupId="operations_group"
          groupTitle="Operations"
          routes={routes}
          {...props}
        />
      </NavList>
    </Nav>
  );
}

describe('NavigationGroup', () => {
  /*
   * The heading opens and closes its group, as it always has: the rail is eight
   * groups now where it was five, and folding one away is how the last of them
   * stays in reach.
   */
  test('should render a heading that opens and closes its items', () => {
    const { container } = renderGroup();

    expect(screen.getByRole('button', { name: 'Operations' })).toBeVisible();
    expect(
      container.querySelector('[data-ouia-component-type="PF6/NavExpandable"]')
    ).toBeInTheDocument();
    expect(container.querySelector('.pf-v6-c-nav__subnav')).toBeInTheDocument();
  });

  test('should leave out the routes the rail reaches through a tab', () => {
    renderGroup();

    expect(screen.getByText('Runs')).toBeInTheDocument();
    expect(screen.queryByText('Credential types')).toBeNull();
  });

  /*
   * A tab is a screen the rail does not list, so the item it hangs off stays
   * the current one: reading a credential type is still being in Credentials.
   */
  test('should mark the item whose tab is open as the current one', () => {
    const tabbed = [
      { title: 'Credentials', path: '/credentials' },
      {
        title: 'Credential types',
        path: '/credential_types',
        isHiddenFromNav: true,
        tabOf: '/credentials',
      },
    ];

    renderWithContexts(
      <Nav aria-label="Navigation">
        <NavList>
          <NavigationGroup
            groupId="resources_group"
            groupTitle="Resources"
            routes={tabbed}
          />
        </NavList>
      </Nav>,
      {
        context: {
          router: {
            history: createMemoryHistory({
              initialEntries: ['/credential_types/1/details'],
            }),
          },
        },
      }
    );

    expect(screen.getByText('Credentials').closest('a')).toHaveClass(
      'pf-m-current'
    );
  });

  test('should pin an untitled group above the groups', () => {
    const { container } = renderWithContexts(
      <Nav aria-label="Navigation">
        <NavList>
          <NavigationGroup
            groupId="dashboard"
            groupTitle={null}
            routes={[{ title: 'Dashboard', path: '/home' }]}
          />
        </NavList>
      </Nav>
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(
      container.querySelector('[data-ouia-component-type="PF6/NavExpandable"]')
    ).toBeNull();
  });

  /*
   * The one badge in the rail, and only while something waits: a zero beside
   * Approvals reads as a state to clear rather than nothing to do.
   */
  test('should count the approvals waiting on this user, and only those', () => {
    renderGroup({ approvalCount: 3 });

    const approvals = screen.getByText('Approvals').closest('a');
    expect(approvals).toHaveTextContent('3');
    expect(screen.getByText('Runs').closest('a')).not.toHaveTextContent(/\d/);
  });

  test('should show no badge when nothing is waiting', () => {
    const { container } = renderGroup({ approvalCount: 0 });

    expect(container.querySelector('.pf-v6-c-badge')).toBeNull();
  });

  /*
   * The rail is eight groups deep, so closing the ones somebody never opens is
   * how they keep the rest in reach. Reopening them on every page load undoes
   * that, which is why what was closed is remembered per browser.
   */
  describe('remembering what was closed', () => {
    afterEach(() => {
      localStorage.removeItem(STORAGE_KEY);
    });

    test('should open every group where nothing was closed', () => {
      const { container } = renderGroup();

      expect(
        container.querySelector('.pf-v6-c-nav__item.pf-m-expanded')
      ).toBeInTheDocument();
    });

    test('should keep a group closed once it was closed', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['operations_group']));

      const { container } = renderGroup();

      expect(
        container.querySelector('.pf-v6-c-nav__item.pf-m-expanded')
      ).toBeNull();
      // PatternFly keeps a closed group's items in the page and hides the list
      // they sit in, so that is what a closed group means here.
      expect(container.querySelector('.pf-v6-c-nav__subnav')).toHaveAttribute(
        'hidden'
      );
    });

    test('should record a group as the person leaves it', async () => {
      const { user } = renderGroup();

      await user.click(screen.getByRole('button', { name: 'Operations' }));
      expect(localStorage.getItem(STORAGE_KEY)).toBe('["operations_group"]');

      await user.click(screen.getByRole('button', { name: 'Operations' }));
      expect(localStorage.getItem(STORAGE_KEY)).toBe('[]');
    });
  });

  describe('how long a group takes to open', () => {
    /*
     * One duration for every group would have the tall ones travelling three
     * times as far in the same time, so the time is taken from the distance
     * and every group opens at the same apparent speed.
     */
    test('gives a taller group proportionally longer', () => {
      expect(openingMs(160)).toBe(200);
      expect(openingMs(240)).toBe(300);
      expect(openingMs(240) / openingMs(160)).toBeCloseTo(240 / 160, 5);
    });

    test('keeps a short group from being instant', () => {
      expect(openingMs(40)).toBe(140);
      expect(openingMs(76)).toBe(140);
    });

    test('keeps the tallest from dragging', () => {
      expect(openingMs(400)).toBe(320);
      expect(openingMs(4000)).toBe(320);
    });
  });

  /*
   * A group opened below the fold grows where nobody can see it. Once it has
   * opened it is scrolled into view, by no more than it takes; a group that
   * was open when the page loaded is left alone.
   */
  describe('bringing an opened group into view', () => {
    const scrollIntoView = vi.fn();
    let scrollHeight: PropertyDescriptor | undefined;

    beforeEach(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['operations_group']));
      Element.prototype.scrollIntoView = scrollIntoView;
      // jsdom lays nothing out, and a list of no height is not measured.
      scrollHeight = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'scrollHeight'
      );
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
        configurable: true,
        get: () => 120,
      });
    });

    afterEach(() => {
      localStorage.removeItem(STORAGE_KEY);
      scrollIntoView.mockReset();
      if (scrollHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          'scrollHeight',
          scrollHeight
        );
      }
    });

    test('should scroll to a group once it has opened', async () => {
      const { user, container } = renderGroup();

      await user.click(screen.getByRole('button', { name: 'Operations' }));
      // Not while it is still opening.
      expect(scrollIntoView).not.toHaveBeenCalled();

      const subnav = container.querySelector(
        '.pf-v6-c-nav__subnav'
      ) as HTMLElement;
      const ended = new Event('transitionend', { bubbles: true });
      Object.assign(ended, { propertyName: 'max-height' });
      act(() => {
        subnav.dispatchEvent(ended);
      });

      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: 'nearest',
        behavior: 'smooth',
      });
    });

    test('should leave alone a group that was open on arrival', () => {
      localStorage.removeItem(STORAGE_KEY);
      renderGroup();

      expect(scrollIntoView).not.toHaveBeenCalled();
    });
  });

  /*
   * The rail hands every group a new routes array each time it renders. The
   * group is measured, and its size watched, once for what it lists rather
   * than again for every new array holding the same routes.
   */
  test('should not watch the group again for the same routes', () => {
    const observe = vi.fn();
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      observe = observe;

      unobserve = vi.fn();

      disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;
    try {
      // A rail that renders again with a fresh copy of the same routes.
      function Rail() {
        const [renders, setRenders] = React.useState(0);
        return (
          <>
            <button type="button" onClick={() => setRenders(renders + 1)}>
              Render again
            </button>
            <Nav aria-label="Navigation">
              <NavList>
                <NavigationGroup
                  groupId="operations_group"
                  groupTitle="Operations"
                  routes={routes.map((route) => ({ ...route }))}
                />
              </NavList>
            </Nav>
          </>
        );
      }
      renderWithContexts(<Rail />);
      const onMount = observe.mock.calls.length;
      expect(onMount).toBeGreaterThan(0);

      act(() => {
        screen.getByRole('button', { name: 'Render again' }).click();
      });

      expect(observe).toHaveBeenCalledTimes(onMount);
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
});
