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

  const renderAt = (pathname) =>
    renderWithContexts(
      <ScreenHeader streamType="all_activity" breadcrumbConfig={config} />,
      {
        context: {
          router: { history: createMemoryHistory({ initialEntries: [pathname] }) },
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

  test('renders breadcrumb items defined in breadcrumbConfig', () => {
    const routes = [
      ['/fo', 0],
      ['/foo', 0],
      ['/foo/1', 1],
      ['/foo/baz', 1],
      ['/foo/1/bar', 2],
      ['/foo/1/bar/fiz', 3],
    ];

    routes.forEach(([location, crumbLength]) => {
      const { unmount } = renderAt(location);

      const nav = screen.queryByRole('navigation', { name: 'Breadcrumb' });
      const crumbs = nav ? within(nav).queryAllByRole('link') : [];
      expect(crumbs).toHaveLength(crumbLength);

      unmount();
    });
  });
});
