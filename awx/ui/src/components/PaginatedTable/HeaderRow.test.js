import React from 'react';
import { screen, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import HeaderRow, { HeaderCell } from './HeaderRow';

describe('<HeaderRow />', () => {
  const qsConfig = {
    defaultParams: {
      order_by: 'one',
    },
  };

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
});
