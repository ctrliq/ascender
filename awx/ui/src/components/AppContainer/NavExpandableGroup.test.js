import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import { Nav } from '@patternfly/react-core';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import NavExpandableGroup from './NavExpandableGroup';

const routes = [
  { path: '/foo', title: 'Foo' },
  { path: '/bar', title: 'Bar' },
  { path: '/fiz', title: 'Fiz' },
];

function renderGroup(initialEntry) {
  return renderWithContexts(
    <Nav aria-label="Test Navigation">
      <NavExpandableGroup groupId="test" groupTitle="Test" routes={routes} />
    </Nav>,
    {
      context: {
        router: {
          history: createMemoryHistory({ initialEntries: [initialEntry] }),
        },
      },
    }
  );
}

// PF NavItem renders the active link with aria-current="page" (the DOM
// equivalent of the enzyme NavItem isActive prop), and each Link renders an
// <a> whose href is the route path (the DOM equivalent of Link `to`).
describe('NavExpandableGroup', () => {
  test('initialization and render', () => {
    renderGroup('/foo');

    const foo = screen.getByRole('link', { name: 'Foo' });
    const bar = screen.getByRole('link', { name: 'Bar' });
    const fiz = screen.getByRole('link', { name: 'Fiz' });

    expect(foo).toHaveAttribute('href', '/foo');
    expect(bar).toHaveAttribute('href', '/bar');
    expect(fiz).toHaveAttribute('href', '/fiz');

    expect(foo).toHaveAttribute('aria-current', 'page');
    expect(bar).not.toHaveAttribute('aria-current', 'page');
    expect(fiz).not.toHaveAttribute('aria-current', 'page');
  });

  test('when location is /foo/1/bar/fiz isActive returns false', () => {
    renderGroup('/foo/1/bar/fiz');

    const foo = screen.getByRole('link', { name: 'Foo' });
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(foo).toHaveAttribute('href', '/foo');
    // matchPath without exact still matches /foo as a prefix of /foo/1/bar/fiz
    expect(foo).toHaveAttribute('aria-current', 'page');
  });

  test('when location is /fo isActive returns false', () => {
    renderGroup('/fo');

    const foo = screen.getByRole('link', { name: 'Foo' });
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(foo).toHaveAttribute('href', '/foo');
    expect(foo).not.toHaveAttribute('aria-current', 'page');
  });

  test('when location is /foo isActive returns true', () => {
    renderGroup('/foo');

    const foo = screen.getByRole('link', { name: 'Foo' });
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(foo).toHaveAttribute('href', '/foo');
    expect(foo).toHaveAttribute('aria-current', 'page');
  });
});
