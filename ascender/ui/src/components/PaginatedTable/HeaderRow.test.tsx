import React from 'react';
import { screen, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import type { QSConfig } from 'util/qs';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import HeaderRow, { HeaderCell } from './HeaderRow';

describe('<HeaderRow />', () => {
  // Only the default sort key is read here, so the rest of the config is
  // deliberately absent.
  const qsConfig = {
    defaultParams: {
      order_by: 'one',
    },
  } as unknown as QSConfig;

  test('should render cells', async () => {
    renderWithContexts(
      <table>
        <HeaderRow qsConfig={qsConfig}>
          <HeaderCell sortKey="one">One</HeaderCell>
          <HeaderCell>Two</HeaderCell>
        </HeaderRow>
      </table>
    );

    // HeaderRow is selectable by default, so it renders an empty leading
    // <th> plus the two HeaderCell columns = 3 column headers
    const cells = screen.getAllByRole('columnheader');
    expect(cells).toHaveLength(3);
    expect(cells[1]).toHaveTextContent('One');
    expect(cells[2]).toHaveTextContent('Two');
  });

  test('should provide sort controls', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/list'],
    });
    const { user } = renderWithContexts(
      <table>
        <HeaderRow qsConfig={qsConfig}>
          <HeaderCell sortKey="one">One</HeaderCell>
          <HeaderCell>Two</HeaderCell>
        </HeaderRow>
      </table>,
      { context: { router: { history } } }
    );

    // the "One" column is sortable and currently sorted ascending (the default
    // order_by), so clicking its sort button toggles it to descending
    const oneHeader = screen.getByRole('columnheader', { name: /One/ });
    await user.click(within(oneHeader).getByRole('button', { name: 'One' }));
    expect(history.location.search).toEqual('?order_by=-one');
  });

  test('should not sort cells without a sortKey', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/list'],
    });
    renderWithContexts(
      <table>
        <HeaderRow qsConfig={qsConfig}>
          <HeaderCell sortKey="one">One</HeaderCell>
          <HeaderCell>Two</HeaderCell>
        </HeaderRow>
      </table>,
      { context: { router: { history } } }
    );

    // the "Two" column has no sortKey, so it renders no sort button (sort=null)
    const twoHeader = screen.getByRole('columnheader', { name: 'Two' });
    expect(within(twoHeader).queryByRole('button')).not.toBeInTheDocument();
  });

  test('should handle null children gracefully', async () => {
    const nope = false;
    renderWithContexts(
      <table>
        <HeaderRow qsConfig={qsConfig}>
          <HeaderCell sortKey="one">One</HeaderCell>
          {nope && <HeaderCell>Hidden</HeaderCell>}
          <HeaderCell>Two</HeaderCell>
        </HeaderRow>
      </table>
    );

    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
  });

  /*
   * Every column reads from the left, the actions one included. It used to be
   * singled out and pushed right, which put the heading over the far edge of
   * the table rather than over the icons it names, and the test that it was the
   * actions column was the English word: under any other language the heading
   * quietly went back to the left while the icons stayed where they were.
   */
  test('gives the actions column no alignment of its own', async () => {
    const { container } = renderWithContexts(
      <table>
        <HeaderRow qsConfig={qsConfig}>
          <HeaderCell>Status</HeaderCell>
          <HeaderCell>Actions</HeaderCell>
        </HeaderRow>
      </table>
    );

    const headers = [...container.querySelectorAll('th')];
    const plain = headers.find((th) => th.textContent?.trim() === 'Status');
    const actions = headers.find((th) => th.textContent?.trim() === 'Actions');

    expect(actions?.className).not.toMatch(/align-right/);
    // The same cell as any other, which is the whole of the point.
    expect(actions?.className).toBe(plain?.className);
  });
});
