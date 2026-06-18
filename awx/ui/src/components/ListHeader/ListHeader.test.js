import React from 'react';
import { act } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ListHeader from './ListHeader';

describe('ListHeader', () => {
  const qsConfig = {
    namespace: 'item',
    defaultParams: { page: 1, page_size: 5, order_by: 'foo' },
    integerFields: ['id', 'page', 'page_size'],
    dateFields: ['modified', 'created'],
  };

  // Capture the toolbar props ListHeader passes to its renderToolbar callback
  // so the handlers (onSort/onSearch/onRemove/clearAllFilters) can be exercised
  // directly, mirroring the enzyme suite's `toolbar.prop('onX')(...)`.
  function makeCapturingToolbar() {
    const captured = {};
    const renderToolbar = (props) => {
      Object.assign(captured, props);
      return <div data-testid="toolbar" />;
    };
    return { captured, renderToolbar };
  }

  const baseProps = {
    qsConfig,
    searchColumns: [{ name: 'foo', key: 'foo__icontains', isDefault: true }],
    sortColumns: [{ name: 'foo', key: 'foo' }],
  };

  test('initially renders without crashing', () => {
    const history = createMemoryHistory({
      initialEntries: ['/organizations/1/teams'],
    });
    const { container } = renderWithContexts(
      <ListHeader
        itemCount={50}
        renderToolbar={jest.fn()}
        {...baseProps}
      />,
      { context: { router: { history } } }
    );
    expect(container).toBeInTheDocument();
  });

  test('should navigate when DataListToolbar calls onSort prop', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/organizations/1/teams'],
    });
    const { captured, renderToolbar } = makeCapturingToolbar();
    renderWithContexts(
      <ListHeader itemCount={7} renderToolbar={renderToolbar} {...baseProps} />,
      { context: { router: { history } } }
    );

    act(() => {
      captured.onSort('foo', 'descending');
    });
    expect(history.location.search).toEqual('?item.order_by=-foo');
    act(() => {
      captured.onSort('foo', 'ascending');
    });
    // since order_by = foo is the default, that should be stripped out of the search
    expect(history.location.search).toEqual('');
  });

  test('should clear all', () => {
    const query = '?item.page_size=5&item.name=foo';
    const history = createMemoryHistory({
      initialEntries: [`/organizations/1/teams${query}`],
    });
    const { captured, renderToolbar } = makeCapturingToolbar();
    renderWithContexts(
      <ListHeader itemCount={7} renderToolbar={renderToolbar} {...baseProps} />,
      { context: { router: { history } } }
    );

    expect(history.location.search).toEqual(query);
    act(() => {
      captured.clearAllFilters();
    });
    expect(history.location.search).toEqual('?item.page_size=5');
  });

  test('should test handle search', () => {
    const query = '?item.page_size=10';
    const history = createMemoryHistory({
      initialEntries: [`/organizations/1/teams${query}`],
    });
    const { captured, renderToolbar } = makeCapturingToolbar();
    renderWithContexts(
      <ListHeader itemCount={7} renderToolbar={renderToolbar} {...baseProps} />,
      { context: { router: { history } } }
    );

    expect(history.location.search).toEqual(query);
    act(() => {
      captured.onSearch('name__icontains', 'foo');
    });
    expect(history.location.search).toEqual(
      '?item.name__icontains=foo&item.page_size=10'
    );
  });

  test('should test handle remove', () => {
    const query = '?item.name__icontains=foo&item.page_size=10';
    const history = createMemoryHistory({
      initialEntries: [`/organizations/1/teams${query}`],
    });
    const { captured, renderToolbar } = makeCapturingToolbar();
    renderWithContexts(
      <ListHeader itemCount={7} renderToolbar={renderToolbar} {...baseProps} />,
      { context: { router: { history } } }
    );

    expect(history.location.search).toEqual(query);
    act(() => {
      captured.onRemove('name__icontains', 'foo');
    });
    expect(history.location.search).toEqual('?item.page_size=10');
  });
});
