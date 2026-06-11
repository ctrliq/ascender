import React from 'react';
import { createMemoryHistory } from 'history';

import { Nav } from '@patternfly/react-core';
import { mountWithContexts } from '../../../testUtils/enzymeHelpers';
import NavExpandableGroup from './NavExpandableGroup';

describe('NavExpandableGroup', () => {
  test('initialization and render', () => {
    const component = mountWithContexts(
      <Nav aria-label="Test Navigation">
          <NavExpandableGroup
            groupId="test"
            groupTitle="Test"
            routes={[
              { path: '/foo', title: 'Foo' },
              { path: '/bar', title: 'Bar' },
              { path: '/fiz', title: 'Fiz' },
            ]}
          />
        </Nav>,
      {
        context: {
          router: { history: createMemoryHistory({ initialEntries: ['/foo'] }) },
        },
      }
    ).find('NavExpandableGroup');

    expect(component.find('NavItem').length).toEqual(3);
    let link = component.find('NavItem').at(0);
    expect(component.find('NavItem').at(0).prop('isActive')).toBeTruthy();
    expect(link.find('Link').prop('to')).toBe('/foo');

    link = component.find('NavItem').at(1);
    expect(link.prop('isActive')).toBeFalsy();
    expect(link.find('Link').prop('to')).toBe('/bar');

    link = component.find('NavItem').at(2);
    expect(link.prop('isActive')).toBeFalsy();
    expect(link.find('Link').prop('to')).toBe('/fiz');
  });

  test('when location is /foo/1/bar/fiz isActive returns false', () => {
    const component = mountWithContexts(
      <Nav aria-label="Test Navigation">
          <NavExpandableGroup
            groupId="test"
            groupTitle="Test"
            routes={[
              { path: '/foo', title: 'Foo' },
              { path: '/bar', title: 'Bar' },
              { path: '/fiz', title: 'Fiz' },
            ]}
          />
        </Nav>,
      {
        context: {
          router: { history: createMemoryHistory({ initialEntries: ['/foo/1/bar/fiz'] }) },
        },
      }
    ).find('NavExpandableGroup');

    expect(component.find('NavItem').length).toEqual(3);
    const link = component.find('NavItem').at(0);
    expect(component.find('NavItem').at(0).prop('isActive')).toBeTruthy();
    expect(link.find('Link').prop('to')).toBe('/foo');
  });

  test('when location is /fo isActive returns false', () => {
    const component = mountWithContexts(
      <Nav aria-label="Test Navigation">
          <NavExpandableGroup
            groupId="test"
            groupTitle="Test"
            routes={[
              { path: '/foo', title: 'Foo' },
              { path: '/bar', title: 'Bar' },
              { path: '/fiz', title: 'Fiz' },
            ]}
          />
        </Nav>,
      {
        context: {
          router: { history: createMemoryHistory({ initialEntries: ['/fo'] }) },
        },
      }
    ).find('NavExpandableGroup');

    expect(component.find('NavItem').length).toEqual(3);
    const link = component.find('NavItem').at(0);
    expect(component.find('NavItem').at(0).prop('isActive')).toBeFalsy();
    expect(link.find('Link').prop('to')).toBe('/foo');
  });

  test('when location is /foo isActive returns true', () => {
    const component = mountWithContexts(
      <Nav aria-label="Test Navigation">
          <NavExpandableGroup
            groupId="test"
            groupTitle="Test"
            routes={[
              { path: '/foo', title: 'Foo' },
              { path: '/bar', title: 'Bar' },
              { path: '/fiz', title: 'Fiz' },
            ]}
          />
        </Nav>,
      {
        context: {
          router: { history: createMemoryHistory({ initialEntries: ['/foo'] }) },
        },
      }
    ).find('NavExpandableGroup');

    expect(component.find('NavItem').length).toEqual(3);
    const link = component.find('NavItem').at(0);
    expect(component.find('NavItem').at(0).prop('isActive')).toBeTruthy();
    expect(link.find('Link').prop('to')).toBe('/foo');
  });
});
