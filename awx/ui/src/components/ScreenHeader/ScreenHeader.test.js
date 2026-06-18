import React from 'react';
import { screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import ScreenHeader from './ScreenHeader';

describe('<ScreenHeader />', () => {
  const config = {
    '/foo': 'Foo',
    '/foo/1': 'One',
    '/foo/1/bar': 'Bar',
    '/foo/1/bar/fiz': 'Fiz',
  };

  test('initially renders successfully', () => {
    renderWithContexts(
      <MemoryRouter initialEntries={['/foo/1/bar']} initialIndex={0}>
        <ScreenHeader streamType="all_activity" breadcrumbConfig={config} />
      </MemoryRouter>
    );

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
      const { unmount } = renderWithContexts(
        <MemoryRouter initialEntries={[location]}>
          <ScreenHeader streamType="all_activity" breadcrumbConfig={config} />
        </MemoryRouter>
      );

      const nav = screen.queryByRole('navigation', { name: 'Breadcrumb' });
      const crumbs = nav ? within(nav).queryAllByRole('link') : [];
      expect(crumbs).toHaveLength(crumbLength);

      unmount();
    });
  });
});
