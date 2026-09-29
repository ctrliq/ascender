import React from 'react';
import { screen, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import ScreenHeader from './ScreenHeader';

describe('<ScreenHeader />', () => {
  const config = {
    '/foo': 'Foo',
    '/foo/1': 'One',
    '/foo/1/bar': 'Bar',
    '/foo/1/bar/fiz': 'Fiz',
  };

  const renderAt = (pathname: string) =>
    renderWithContexts(
      <ScreenHeader streamType="all_activity" breadcrumbConfig={config} />,
      {
        context: {
          router: {
            history: createMemoryHistory({ initialEntries: [pathname] }),
          },
        },
      }
    );

  test('initially renders successfully', () => {
    renderAt('/foo/1/bar');

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const crumbs = within(nav).getAllByRole('link');
    expect(crumbs).toHaveLength(2);
    expect(crumbs[0]).toHaveTextContent('Foo');
    expect(crumbs[1]).toHaveTextContent('One');

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Bar');
  });

  /*
   * A view is labelled for the thing it shows, so the thing's own address
   * would otherwise stand in the trail saying what the title says.
   */
  test('should not repeat the title in the trail', () => {
    renderWithContexts(
      <ScreenHeader
        streamType="all_activity"
        breadcrumbConfig={{
          '/foo': 'Foo',
          '/foo/1': 'One',
          '/foo/1/details': 'One',
        }}
      />,
      {
        context: {
          router: {
            history: createMemoryHistory({
              initialEntries: ['/foo/1/details'],
            }),
          },
        },
      }
    );

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const crumbs = within(nav).getAllByRole('link');
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0]).toHaveTextContent('Foo');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('One');
  });

  test('should title a page the config does not name for its screen', () => {
    renderAt('/foo/baz');

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Foo');
    expect(
      screen.queryByRole('navigation', { name: 'Breadcrumb' })
    ).not.toBeInTheDocument();
  });

  test('renders breadcrumb items defined in breadcrumbConfig', () => {
    const routes = [
      ['/fo', 0],
      ['/foo', 0],
      ['/foo/1', 1],
      // An address the config does not name is titled for the screen above
      // it, which is then the title rather than a crumb repeating it.
      ['/foo/baz', 0],
      ['/foo/1/bar', 2],
      ['/foo/1/bar/fiz', 3],
    ];

    routes.forEach(([location, crumbLength]) => {
      const { unmount } = renderAt(location as string);

      const nav = screen.queryByRole('navigation', { name: 'Breadcrumb' });
      const crumbs = nav ? within(nav).queryAllByRole('link') : [];
      expect(crumbs).toHaveLength(crumbLength as unknown as number);

      unmount();
    });
  });
});
