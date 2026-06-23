import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import Sort from './Sort';

jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useLocation: () => ({
    pathname: '/organizations',
  }),
}));

describe('<Sort />', () => {
  test('should trigger onSort callback', async () => {
    const qsConfig = {
      namespace: 'item',
      defaultParams: { page: 1, page_size: 5, order_by: 'name' },
      integerFields: ['page', 'page_size'],
    };

    const columns = [
      {
        name: 'Name',
        key: 'name',
      },
    ];

    const onSort = jest.fn();

    const { user } = renderWithContexts(
      <Sort qsConfig={qsConfig} columns={columns} onSort={onSort} />
    );

    await user.click(screen.getByRole('button', { name: 'Sort' }));

    expect(onSort).toHaveBeenCalledTimes(1);
    expect(onSort).toHaveBeenCalledWith('name', 'descending');
  });

  test('onSort properly passes back descending when ascending was passed as prop', async () => {
    const qsConfig = {
      namespace: 'item',
      defaultParams: { page: 1, page_size: 5, order_by: 'foo' },
      integerFields: ['page', 'page_size'],
    };

    const columns = [
      { name: 'Foo', key: 'foo' },
      { name: 'Bar', key: 'bar' },
      { name: 'Bakery', key: 'bakery' },
    ];

    const onSort = jest.fn();

    const { user } = renderWithContexts(
      <Sort qsConfig={qsConfig} columns={columns} onSort={onSort} />
    );
    await user.click(screen.getByRole('button', { name: 'Sort' }));
    expect(onSort).toHaveBeenCalledWith('foo', 'descending');
  });

  test('onSort properly passes back ascending when descending was passed as prop', async () => {
    const qsConfig = {
      namespace: 'item',
      defaultParams: { page: 1, page_size: 5, order_by: '-foo' },
      integerFields: ['page', 'page_size'],
    };

    const columns = [
      { name: 'Foo', key: 'foo' },
      { name: 'Bar', key: 'bar' },
      { name: 'Bakery', key: 'bakery' },
    ];

    const onSort = jest.fn();

    const { user } = renderWithContexts(
      <Sort qsConfig={qsConfig} columns={columns} onSort={onSort} />
    );
    await user.click(screen.getByRole('button', { name: 'Sort' }));
    expect(onSort).toHaveBeenCalledWith('foo', 'ascending');
  });

  test('Changing dropdown correctly passes back new sort key', async () => {
    const qsConfig = {
      namespace: 'item',
      defaultParams: { page: 1, page_size: 5, order_by: 'foo' },
      integerFields: ['page', 'page_size'],
    };

    const columns = [
      { name: 'Foo', key: 'foo' },
      { name: 'Bar', key: 'bar' },
      { name: 'Bakery', key: 'bakery' },
    ];

    const onSort = jest.fn();

    const { user } = renderWithContexts(
      <Sort qsConfig={qsConfig} columns={columns} onSort={onSort} />
    );
    // Open the sort dropdown (toggle shows the active column name "Foo").
    await user.click(screen.getByRole('button', { name: 'Foo' }));
    const barItem = await screen.findByText('Bar');
    // Sort's handleDropdownSelect matches the picked column by the clicked
    // element's `innerText`. jsdom does not implement innerText, so define it
    // explicitly here to drive the real production handler.
    Object.defineProperty(barItem, 'innerText', {
      value: 'Bar',
      configurable: true,
    });
    await user.click(barItem);
    await waitFor(() =>
      expect(onSort).toHaveBeenCalledWith('bar', 'ascending')
    );
  });

  test('should display numeric descending icon', () => {
    const qsConfigNumDown = {
      namespace: 'item',
      defaultParams: { page: 1, page_size: 5, order_by: '-id' },
      integerFields: ['page', 'page_size', 'id'],
    };
    const numericColumns = [{ name: 'ID', key: 'id' }];

    const { container } = renderWithContexts(
      <Sort
        qsConfig={qsConfigNumDown}
        columns={numericColumns}
        onSort={jest.fn()}
      />
    );

    // SortNumericDownAltIcon
    const path = container.querySelector('button[aria-label="Sort"] svg path');
    expect(path.getAttribute('d')).toContain('zm224 64h-16V304');
  });

  test('should display numeric ascending icon', () => {
    const qsConfigNumUp = {
      namespace: 'item',
      defaultParams: { page: 1, page_size: 5, order_by: 'id' },
      integerFields: ['page', 'page_size', 'id'],
    };
    const numericColumns = [{ name: 'ID', key: 'id' }];

    const { container } = renderWithContexts(
      <Sort
        qsConfig={qsConfigNumUp}
        columns={numericColumns}
        onSort={jest.fn()}
      />
    );

    // SortNumericDownIcon
    const path = container.querySelector('button[aria-label="Sort"] svg path');
    expect(path.getAttribute('d')).toContain('M304 96h16v64h-16');
  });

  test('should display alphanumeric descending icon', () => {
    const qsConfigAlphaDown = {
      namespace: 'item',
      defaultParams: { page: 1, page_size: 5, order_by: '-name' },
      integerFields: ['page', 'page_size'],
    };
    const alphaColumns = [{ name: 'Name', key: 'name' }];

    const { container } = renderWithContexts(
      <Sort
        qsConfig={qsConfigAlphaDown}
        columns={alphaColumns}
        onSort={jest.fn()}
      />
    );

    // SortAlphaDownAltIcon
    const path = container.querySelector('button[aria-label="Sort"] svg path');
    expect(path.getAttribute('d')).toContain('352zm112-128h128');
  });

  test('should display alphanumeric ascending icon', () => {
    const qsConfigAlphaDown = {
      namespace: 'item',
      defaultParams: { page: 1, page_size: 5, order_by: 'name' },
      integerFields: ['page', 'page_size'],
    };
    const alphaColumns = [{ name: 'Name', key: 'name' }];

    const { container } = renderWithContexts(
      <Sort
        qsConfig={qsConfigAlphaDown}
        columns={alphaColumns}
        onSort={jest.fn()}
      />
    );

    // SortAlphaDownIcon
    const path = container.querySelector('button[aria-label="Sort"] svg path');
    expect(path.getAttribute('d')).toContain('190.22 352 176 352zm240-64H288');
  });
});
