import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import SelectResourceStep from './SelectResourceStep';

describe('<SelectResourceStep />', () => {
  const searchColumns = [
    {
      name: 'Username',
      key: 'username__icontains',
      isDefault: true,
    },
  ];

  const sortColumns = [
    {
      name: 'Username',
      key: 'username',
    },
  ];

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('initially renders without crashing', async () => {
    const fetchItems = jest.fn().mockResolvedValue({
      data: { count: 0, results: [] },
    });
    const fetchOptions = jest.fn().mockResolvedValue({
      data: { actions: { GET: {}, POST: {} }, related_search_fields: [] },
    });
    renderWithContexts(
      <SelectResourceStep
        searchColumns={searchColumns}
        sortColumns={sortColumns}
        displayKey="username"
        onRowClick={() => {}}
        fetchItems={fetchItems}
        fetchOptions={fetchOptions}
      />
    );
    await waitFor(() => expect(fetchItems).toHaveBeenCalled());
  });

  test('fetches resources on mount and adds items to list', async () => {
    const handleSearch = jest.fn().mockResolvedValue({
      data: {
        count: 2,
        results: [
          { id: 1, username: 'foo', url: 'item/1' },
          { id: 2, username: 'bar', url: 'item/2' },
        ],
      },
    });
    const options = jest.fn().mockResolvedValue({
      data: {
        actions: { GET: {}, POST: {} },
        related_search_fields: [],
      },
    });
    renderWithContexts(
      <SelectResourceStep
        searchColumns={searchColumns}
        sortColumns={sortColumns}
        displayKey="username"
        onRowClick={() => {}}
        fetchItems={handleSearch}
        fetchOptions={options}
      />
    );
    await waitFor(() =>
      expect(handleSearch).toHaveBeenCalledWith({
        order_by: 'username',
        page: 1,
        page_size: 5,
      })
    );
    // both rows render
    expect(await screen.findByText('foo')).toBeInTheDocument();
    expect(screen.getByText('bar')).toBeInTheDocument();
  });

  test('clicking on row fires callback with correct params', async () => {
    const handleRowClick = jest.fn();
    const data = {
      count: 2,
      results: [
        { id: 1, username: 'foo', url: 'item/1' },
        { id: 2, username: 'bar', url: 'item/2' },
      ],
    };
    const options = jest.fn().mockResolvedValue({
      data: {
        actions: { GET: {}, POST: {} },
        related_search_fields: [],
      },
    });
    const { user } = renderWithContexts(
      <SelectResourceStep
        searchColumns={searchColumns}
        sortColumns={sortColumns}
        displayKey="username"
        onRowClick={handleRowClick}
        fetchItems={() => ({ data })}
        fetchOptions={options}
        selectedResourceRows={[]}
      />
    );

    const fooRow = (await screen.findByText('foo')).closest('tr');
    const checkbox = within(fooRow).getByRole('checkbox');
    await user.click(checkbox);
    expect(handleRowClick).toHaveBeenCalledWith(data.results[0]);
  });
});
