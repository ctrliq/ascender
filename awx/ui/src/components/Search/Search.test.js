import React from 'react';
import { Toolbar, ToolbarContent } from '@patternfly/react-core';
import { createMemoryHistory } from 'history';
import {
  screen,
  within,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Search from './Search';

const QS_CONFIG = {
  namespace: 'organization',
  dateFields: ['modified', 'created'],
  defaultParams: { page: 1, page_size: 5, order_by: 'name' },
  integerFields: ['page', 'page_size'],
};

function renderSearch(props, options) {
  return renderWithContexts(
    <Toolbar
      id={`${(props.qsConfig || QS_CONFIG).namespace}-list-toolbar`}
      clearAllFilters={() => {}}
      collapseListedFiltersBreakpoint="lg"
    >
      <ToolbarContent>
        <Search
          qsConfig={QS_CONFIG}
          onShowAdvancedSearch={jest.fn()}
          {...props}
        />
      </ToolbarContent>
    </Toolbar>,
    options
  );
}

async function selectKey(user, name) {
  const toggle = screen.getByRole('button', { name: 'Simple key select' });
  if (toggle.getAttribute('aria-expanded') !== 'true') {
    await user.click(toggle);
  }
  const option = await screen.findByRole('option', { name });
  await user.click(option);
}

describe('<Search />', () => {
  test('it triggers the expected callbacks', async () => {
    const columns = [{ name: 'Name', key: 'name__icontains', isDefault: true }];
    const onSearch = jest.fn();
    const { user } = renderSearch({ columns, onSearch });

    await user.type(
      screen.getByRole('searchbox', { name: 'Search text input' }),
      'test-321'
    );
    await user.click(
      screen.getByRole('button', { name: 'Search submit button' })
    );

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('name__icontains', 'test-321');
  });

  test('changing key select updates which key is called for onSearch', async () => {
    const columns = [
      { name: 'Name', key: 'name__icontains', isDefault: true },
      { name: 'Description', key: 'description__icontains' },
    ];
    const onSearch = jest.fn();
    const { user } = renderSearch({ columns, onSearch });

    await selectKey(user, 'Description');
    await user.type(
      screen.getByRole('searchbox', { name: 'Search text input' }),
      'test-321'
    );
    await user.click(
      screen.getByRole('button', { name: 'Search submit button' })
    );

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('description__icontains', 'test-321');
  });

  test('changing key select to and from advanced causes onShowAdvancedSearch callback to be invoked', async () => {
    const columns = [
      { name: 'Name', key: 'name__icontains', isDefault: true },
      { name: 'Description', key: 'description__icontains' },
      { name: 'Advanced', key: 'advanced' },
    ];
    const onShowAdvancedSearch = jest.fn();
    const { user } = renderSearch({
      columns,
      onSearch: jest.fn(),
      onShowAdvancedSearch,
    });

    await selectKey(user, 'Advanced');
    expect(onShowAdvancedSearch).toHaveBeenCalledTimes(1);
    expect(onShowAdvancedSearch).toHaveBeenCalledWith(true);

    onShowAdvancedSearch.mockClear();
    await selectKey(user, 'Description');
    expect(onShowAdvancedSearch).toHaveBeenCalledTimes(1);
    expect(onShowAdvancedSearch).toHaveBeenCalledWith(false);
  });

  test('attempt to search with empty string', async () => {
    const columns = [{ name: 'Name', key: 'name__icontains', isDefault: true }];
    const onSearch = jest.fn();
    const { user } = renderSearch({ columns, onSearch });

    // submit button is disabled while the value is empty; clicking it is a no-op
    await user.click(
      screen.getByRole('button', { name: 'Search submit button' })
    );

    expect(onSearch).toHaveBeenCalledTimes(0);
  });

  test('search with a valid string', async () => {
    const columns = [{ name: 'Name', key: 'name__icontains', isDefault: true }];
    const onSearch = jest.fn();
    const { user } = renderSearch({ columns, onSearch });

    await user.type(
      screen.getByRole('searchbox', { name: 'Search text input' }),
      'test-321'
    );
    await user.click(
      screen.getByRole('button', { name: 'Search submit button' })
    );

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('name__icontains', 'test-321');
  });

  test('filter keys are properly labeled', () => {
    const columns = [
      { name: 'Name', key: 'name__icontains', isDefault: true },
      { name: 'Type', key: 'or__scm_type', options: [['foo', 'Foo Bar!']] },
      { name: 'Description', key: 'description' },
    ];
    const query =
      '?organization.or__scm_type=foo&organization.name__icontains=bar&item.page_size=10';
    const history = createMemoryHistory({
      initialEntries: [`/organizations/${query}`],
    });
    renderSearch({ columns }, { context: { router: { history } } });

    const typeGroup = screen
      .getByText('Type (or__scm_type)')
      .closest('.pf-v6-c-label-group');
    expect(within(typeGroup).getByText('Foo Bar!')).toBeInTheDocument();

    const nameGroup = screen
      .getByText('Name (name__icontains)')
      .closest('.pf-v6-c-label-group');
    expect(within(nameGroup).getByText('bar')).toBeInTheDocument();
  });

  test('should test handle remove of option-based key', async () => {
    const qsConfigNew = {
      namespace: 'item',
      defaultParams: { page: 1, page_size: 5, order_by: '-type' },
      integerFields: [],
    };
    const columns = [
      {
        name: 'type',
        key: 'type',
        options: [['foo', 'Foo Bar!']],
        isDefault: true,
      },
    ];
    const query = '?item.or__type=foo&item.page_size=10';
    const history = createMemoryHistory({
      initialEntries: [`/organizations/1/teams${query}`],
    });
    const onRemove = jest.fn();
    const { user } = renderSearch(
      { qsConfig: qsConfigNew, columns, onRemove },
      { context: { router: { history } } }
    );

    expect(history.location.search).toEqual(query);
    const chip = screen.getByText('foo').closest('.pf-v6-c-label');
    await user.click(within(chip).getByRole('button'));
    expect(onRemove).toHaveBeenCalledWith('or__type', 'foo');
  });

  test('should test handle remove of option-based with empty string value', async () => {
    const qsConfigNew = {
      namespace: 'item',
      defaultParams: { page: 1, page_size: 5, order_by: '-type' },
      integerFields: [],
    };
    const columns = [
      {
        name: 'type',
        key: 'type',
        options: [['', 'manual']],
        isDefault: true,
      },
    ];
    const query = '?item.or__type=&item.page_size=10';
    const history = createMemoryHistory({
      initialEntries: [`/organizations/1/teams${query}`],
    });
    const onRemove = jest.fn();
    const { user } = renderSearch(
      { qsConfig: qsConfigNew, columns, onRemove },
      { context: { router: { history } } }
    );

    expect(history.location.search).toEqual(query);
    const chips = document.querySelectorAll('.pf-v6-c-label');
    expect(chips).toHaveLength(1);
    await user.click(within(chips[0]).getByRole('button'));
    expect(onRemove).toHaveBeenCalledWith('or__type', '');
  });

  test("ToolbarFilter added for any key that doesn't have search column", () => {
    const columns = [
      { name: 'Name', key: 'name__icontains', isDefault: true },
      { name: 'Type', key: 'or__scm_type', options: [['foo', 'Foo Bar!']] },
      { name: 'Description', key: 'description' },
    ];
    const query =
      '?organization.or__scm_type=foo&organization.name__icontains=bar&organization.name__exact=baz&item.page_size=10&organization.foo=bar';
    const history = createMemoryHistory({
      initialEntries: [`/organizations/${query}`],
    });
    renderSearch({ columns }, { context: { router: { history } } });

    const nameExactGroup = screen
      .getByText('name__exact')
      .closest('.pf-v6-c-label-group');
    expect(within(nameExactGroup).getByText('baz')).toBeInTheDocument();

    const fooGroup = screen.getByText('foo').closest('.pf-v6-c-label-group');
    expect(within(fooGroup).getByText('bar')).toBeInTheDocument();
  });

  describe('date fields', () => {
    const dateColumns = [
      { name: 'Name', key: 'name__icontains', isDefault: true },
      { name: 'Created', key: 'created' },
    ];

    function renderDateSearch(onSearch) {
      return renderSearch({ columns: dateColumns, onSearch });
    }

    test('renders date input and operator select for a date column', async () => {
      const { user } = renderDateSearch(jest.fn());
      await selectKey(user, 'Created');

      const dateInput = screen.getByLabelText('Date search input');
      expect(dateInput).toBeInTheDocument();
      expect(dateInput).toHaveAttribute('type', 'date');
      expect(
        screen.getByRole('button', { name: 'Date operator select' })
      ).toBeInTheDocument();
    });

    test('searching submits the column key with the default operator', async () => {
      const onSearch = jest.fn();
      const { user } = renderDateSearch(onSearch);
      await selectKey(user, 'Created');

      fireEvent.change(screen.getByLabelText('Date search input'), {
        target: { value: '2026-06-01' },
      });
      await user.click(
        screen.getByRole('button', { name: 'Search submit button' })
      );

      expect(onSearch).toHaveBeenCalledTimes(1);
      expect(onSearch).toHaveBeenCalledWith('created__gte', '2026-06-01');
    });

    test('switching the operator changes the submitted parameter', async () => {
      const onSearch = jest.fn();
      const { user } = renderDateSearch(onSearch);
      await selectKey(user, 'Created');

      const operatorToggle = screen.getByRole('button', {
        name: 'Date operator select',
      });
      await user.click(operatorToggle);
      await user.click(await screen.findByRole('option', { name: 'Before' }));

      fireEvent.change(screen.getByLabelText('Date search input'), {
        target: { value: '2026-06-30' },
      });
      await user.click(
        screen.getByRole('button', { name: 'Search submit button' })
      );

      expect(onSearch).toHaveBeenCalledTimes(1);
      expect(onSearch).toHaveBeenCalledWith('created__lt', '2026-06-30');
    });

    test('a value typed for a text column does not leak into a date search', async () => {
      const onSearch = jest.fn();
      const { user } = renderDateSearch(onSearch);

      await user.type(
        screen.getByRole('searchbox', { name: 'Search text input' }),
        'foo'
      );
      await selectKey(user, 'Created');

      expect(screen.getByLabelText('Date search input')).toHaveValue('');
      expect(
        screen.getByRole('button', { name: 'Search submit button' })
      ).toBeDisabled();
    });

    test('Enter in the date input submits the search', async () => {
      const onSearch = jest.fn();
      const { user } = renderDateSearch(onSearch);
      await selectKey(user, 'Created');

      const dateInput = screen.getByLabelText('Date search input');
      fireEvent.change(dateInput, { target: { value: '2026-06-15' } });
      fireEvent.keyDown(dateInput, { key: 'Enter' });

      expect(onSearch).toHaveBeenCalledWith('created__gte', '2026-06-15');
    });

    test('operator dropdown does not stay open across column switches', async () => {
      const { user } = renderDateSearch(jest.fn());
      await selectKey(user, 'Created');

      const operatorToggle = screen.getByRole('button', {
        name: 'Date operator select',
      });
      await user.click(operatorToggle);
      expect(
        screen.getByRole('option', { name: 'Before' })
      ).toBeInTheDocument();

      await selectKey(user, 'Name');
      await selectKey(user, 'Created');

      await waitFor(() =>
        expect(
          screen.queryByRole('option', { name: 'Before' })
        ).not.toBeInTheDocument()
      );
    });

    test('non-date columns keep the plain text input', () => {
      renderDateSearch(jest.fn());
      expect(
        screen.queryByLabelText('Date search input')
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('searchbox', { name: 'Search text input' })
      ).toBeInTheDocument();
    });
  });
});
