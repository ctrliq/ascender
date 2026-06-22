import React from 'react';
import { act, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import PersistentFilters from './PersistentFilters';

const KEY = 'awx-persistent-filter';

describe('PersistentFilters', () => {
  test('should initialize filter in sessionStorage', () => {
    expect(sessionStorage.getItem(KEY)).toEqual(null);
    const history = createMemoryHistory({
      initialEntries: ['/templates'],
    });
    renderWithContexts(
      <PersistentFilters pageKey="templates">test</PersistentFilters>,
      { context: { router: { history } } }
    );

    expect(JSON.parse(sessionStorage.getItem(KEY))).toEqual({
      pageKey: 'templates',
      qs: '',
    });
  });

  test('should not restore filters without restoreFilters query param', () => {
    expect(
      sessionStorage.setItem(
        KEY,
        JSON.stringify({
          pageKey: 'templates',
          qs: '?page=2&name=foo',
        })
      )
    );
    const history = createMemoryHistory({
      initialEntries: ['/templates'],
    });
    renderWithContexts(
      <PersistentFilters pageKey="templates">test</PersistentFilters>,
      { context: { router: { history } } }
    );

    expect(history.location.search).toEqual('');
  });

  test('should update stored filters when qs changes', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/templates'],
    });
    renderWithContexts(
      <PersistentFilters pageKey="templates">test</PersistentFilters>,
      { context: { router: { history } } }
    );

    act(() => {
      history.push('/templates?page=3');
    });
    await waitFor(() =>
      expect(JSON.parse(sessionStorage.getItem(KEY))).toEqual({
        pageKey: 'templates',
        qs: '?page=3',
      })
    );
  });
});
