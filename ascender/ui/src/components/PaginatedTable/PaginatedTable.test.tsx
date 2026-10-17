import React from 'react';
import { act, screen, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import PaginatedTable from './PaginatedTable';

const mockData = [
  { id: 1, name: 'one', url: '/org/team/1' },
  { id: 2, name: 'two', url: '/org/team/2' },
  { id: 3, name: 'three', url: '/org/team/3' },
  { id: 4, name: 'four', url: '/org/team/4' },
  { id: 5, name: 'five', url: '/org/team/5' },
];

const qsConfig = {
  namespace: 'item',
  defaultParams: { page: 1, page_size: 5, order_by: 'name' },
  integerFields: ['page', 'page_size'],
  dateFields: [],
};

// the bottom Pagination is rendered with ouiaId="bottom-pagination"; scope
// queries to it because the top (compact) pagination shares the same labels
const bottomPagination = (container: HTMLElement) =>
  within(
    container.querySelector(
      '[data-ouia-component-id="bottom-pagination"]'
    ) as HTMLElement
  );

describe('<PaginatedTable />', () => {
  test('should render item rows', () => {
    const history = createMemoryHistory({
      initialEntries: ['/organizations/1/teams'],
    });
    const { container } = renderWithContexts(
      <PaginatedTable
        items={mockData}
        itemCount={7}
        queryParams={{
          page: 1,
          page_size: 5,
          order_by: 'name',
        }}
        qsConfig={qsConfig}
        renderRow={(item) => (
          <tr key={item.id}>
            <td>{item.name}</td>
          </tr>
        )}
      />,
      { context: { router: { history } } }
    );

    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent('one');
    expect(rows[1]).toHaveTextContent('two');
    expect(rows[2]).toHaveTextContent('three');
    expect(rows[3]).toHaveTextContent('four');
    expect(rows[4]).toHaveTextContent('five');
  });

  /*
   * Every change to the query string clears the selection, including the
   * search box's, which replaces the address rather than pushing one: a tick
   * kept across a new filter could sit on a row that filter hides, and a bulk
   * action would still reach it.
   */
  describe('what a change of address does to the selection', () => {
    function renderTable(history: ReturnType<typeof createMemoryHistory>) {
      const clearSelected = vi.fn();
      renderWithContexts(
        <PaginatedTable
          items={mockData}
          itemCount={7}
          queryParams={{ page: 1, page_size: 5, order_by: 'name' }}
          qsConfig={qsConfig}
          clearSelected={clearSelected}
          renderRow={() => null}
        />,
        { context: { router: { history } } }
      );
      clearSelected.mockClear();
      return clearSelected;
    }

    test('should clear it where the address is replaced', () => {
      const history = createMemoryHistory({
        initialEntries: ['/organizations/1/teams'],
      });
      const clearSelected = renderTable(history);

      act(() =>
        history.replace('/organizations/1/teams?item.name__icontains=t')
      );

      expect(clearSelected).toHaveBeenCalled();
    });

    test('should clear it where the address is pushed', () => {
      const history = createMemoryHistory({
        initialEntries: ['/organizations/1/teams'],
      });
      const clearSelected = renderTable(history);

      act(() => history.push('/organizations/1/teams?item.page=2'));

      expect(clearSelected).toHaveBeenCalled();
    });
  });

  test('should navigate page when changes', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/organizations/1/teams'],
    });
    const { container, user } = renderWithContexts(
      <PaginatedTable
        items={mockData}
        itemCount={7}
        queryParams={{
          page: 1,
          page_size: 5,
          order_by: 'name',
        }}
        qsConfig={qsConfig}
        renderRow={() => null}
      />,
      { context: { router: { history } } }
    );

    await user.click(
      bottomPagination(container).getByRole('button', {
        name: 'Go to next page',
      })
    );
    expect(history.location.search).toEqual('?item.page=2');

    await user.click(
      bottomPagination(container).getByRole('button', {
        name: 'Go to previous page',
      })
    );
    // since page = 1 is the default, that should be stripped out of the search
    expect(history.location.search).toEqual('');
  });

  test('should navigate to page when page size changes', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/organizations/1/teams?item.page=2'],
    });
    const { container, user } = renderWithContexts(
      <PaginatedTable
        items={mockData}
        itemCount={7}
        queryParams={{
          page: 2,
          page_size: 5,
          order_by: 'name',
        }}
        qsConfig={qsConfig}
        renderRow={() => null}
      />,
      { context: { router: { history } } }
    );

    // open the per-page dropdown (its toggle is labelled "Select") and pick 20
    await user.click(
      bottomPagination(container).getByRole('button', { name: 'Select' })
    );
    await user.click(screen.getByRole('menuitem', { name: '20 per page' }));
    // PF recomputes the page for the new page size; with 7 items at 20/page it
    // lands back on page 1 (the default, so it is stripped from the query) and
    // only the new page_size is pushed
    expect(history.location.search).toEqual('?item.page_size=20');
  });
});
