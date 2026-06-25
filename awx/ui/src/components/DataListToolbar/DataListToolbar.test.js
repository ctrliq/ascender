import React from 'react';
import { screen, within, fireEvent } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import DataListToolbar from './DataListToolbar';
import AddDropDownButton from '../AddDropDownButton/AddDropDownButton';

describe('<DataListToolbar />', () => {
  const QS_CONFIG = {
    namespace: 'organization',
    dateFields: ['modified', 'created'],
    defaultParams: { page: 1, page_size: 5, order_by: 'name' },
    integerFields: ['page', 'page_size'],
  };

  const onSearch = jest.fn();
  const onReplaceSearch = jest.fn();
  const onSort = jest.fn();
  const onSelectAll = jest.fn();
  const onExpandAll = jest.fn();

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('it triggers the expected callbacks', async () => {
    const searchColumns = [
      { name: 'Name', key: 'name__icontains', isDefault: true },
    ];
    const sortColumns = [{ name: 'Name', key: 'name' }];

    const { user } = renderWithContexts(
      <DataListToolbar
        qsConfig={QS_CONFIG}
        isAllSelected={false}
        searchColumns={searchColumns}
        sortColumns={sortColumns}
        onSearch={onSearch}
        onReplaceSearch={onReplaceSearch}
        onSort={onSort}
        onSelectAll={onSelectAll}
        showSelectAll
      />
    );

    await user.click(screen.getByRole('button', { name: 'Sort' }));
    expect(onSort).toHaveBeenCalledTimes(1);
    expect(onSort).toHaveBeenCalledWith('name', 'descending');

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
    // starting unchecked, clicking toggles to checked -> PF Checkbox passes true
    expect(onSelectAll.mock.calls[0][0]).toBe(true);

    const input = screen.getByLabelText('Search text input');
    await user.type(input, 'test-321');
    await user.click(
      screen.getByRole('button', { name: 'Search submit button' })
    );
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('name__icontains', 'test-321');
  });

  test('should reflect isAllSelected on the select-all checkbox', () => {
    const searchColumns = [{ name: 'Name', key: 'name', isDefault: true }];
    const sortColumns = [{ name: 'Name', key: 'name' }];
    renderWithContexts(
      <DataListToolbar
        qsConfig={QS_CONFIG}
        isAllSelected
        searchColumns={searchColumns}
        sortColumns={sortColumns}
        onSearch={onSearch}
        onReplaceSearch={onReplaceSearch}
        onSort={onSort}
        onSelectAll={onSelectAll}
        showSelectAll
      />
    );
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toBeChecked();
  });

  test('should render the sort control', () => {
    const sortColumns = [{ name: 'Name', key: 'name' }];
    renderWithContexts(
      <DataListToolbar
        qsConfig={QS_CONFIG}
        searchColumns={[{ name: 'ID', key: 'id', isDefault: true }]}
        sortColumns={sortColumns}
        onSearch={onSearch}
        onSort={onSort}
      />
    );
    expect(screen.getByRole('button', { name: 'Sort' })).toBeInTheDocument();
  });

  test('should render additionalControls', () => {
    const searchColumns = [{ name: 'Name', key: 'name', isDefault: true }];
    const sortColumns = [{ name: 'Name', key: 'name' }];

    renderWithContexts(
      <DataListToolbar
        qsConfig={QS_CONFIG}
        searchColumns={searchColumns}
        sortColumns={sortColumns}
        onSearch={onSearch}
        onReplaceSearch={onReplaceSearch}
        onSort={onSort}
        onSelectAll={onSelectAll}
        additionalControls={[
          <button key="1" id="test" type="button">
            click
          </button>,
        ]}
      />
    );

    expect(screen.getByRole('button', { name: 'click' })).toBeInTheDocument();
  });

  test('always adds advanced item to the search column dropdown', async () => {
    const searchColumns = [{ name: 'Name', key: 'name', isDefault: true }];
    const sortColumns = [{ name: 'Name', key: 'name' }];

    const { user } = renderWithContexts(
      <DataListToolbar
        qsConfig={QS_CONFIG}
        searchColumns={searchColumns}
        sortColumns={sortColumns}
        onSearch={onSearch}
        onReplaceSearch={onReplaceSearch}
        onSort={onSort}
        onSelectAll={onSelectAll}
      />
    );

    // open the simple-key select and assert the injected "Advanced" option
    await user.click(screen.getByRole('button', { name: 'Simple key select' }));
    expect(
      screen.getByRole('option', { name: 'Advanced' })
    ).toBeInTheDocument();
  });

  test('should render the kebab and its items when in advanced search mode', async () => {
    const searchColumns = [{ name: 'Name', key: 'name', isDefault: true }];
    const sortColumns = [{ name: 'Name', key: 'name' }];

    const { user } = renderWithContexts(
      <DataListToolbar
        qsConfig={QS_CONFIG}
        searchColumns={searchColumns}
        sortColumns={sortColumns}
        onSearch={onSearch}
        onReplaceSearch={onReplaceSearch}
        onSort={onSort}
        onSelectAll={onSelectAll}
        additionalControls={[
          <AddDropDownButton
            key="add"
            dropdownItems={[
              <div key="add container" aria-label="add container">
                Add Container
              </div>,
              <div key="add instance group" aria-label="add instance group">
                Add Instance Group
              </div>,
            ]}
          />,
        ]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Simple key select' }));
    await user.click(screen.getByRole('option', { name: 'Advanced' }));

    // a kebab toggle appears in advanced search mode
    const kebab = await screen.findByRole('button', { name: 'Actions' });
    await user.click(kebab);

    expect(screen.getByLabelText('add container')).toBeInTheDocument();
    expect(screen.getByLabelText('add instance group')).toBeInTheDocument();
  });

  test('should handle expanded rows', async () => {
    const searchColumns = [
      { name: 'Name', key: 'name__icontains', isDefault: true },
    ];
    const sortColumns = [{ name: 'Name', key: 'name' }];

    const { user } = renderWithContexts(
      <DataListToolbar
        qsConfig={QS_CONFIG}
        isAllSelected={false}
        searchColumns={searchColumns}
        sortColumns={sortColumns}
        onSearch={onSearch}
        onReplaceSearch={onReplaceSearch}
        onSort={onSort}
        onSelectAll={onSelectAll}
        showSelectAll
        isAllExpanded={false}
        onExpandAll={onExpandAll}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Expand all rows' })
    );
    expect(onExpandAll).toHaveBeenCalledWith(true);
  });

  test('should render the expand/collapse all toggle reflecting isAllExpanded', () => {
    const searchColumns = [
      { name: 'Name', key: 'name__icontains', isDefault: true },
    ];
    const sortColumns = [{ name: 'Name', key: 'name' }];

    renderWithContexts(
      <DataListToolbar
        qsConfig={QS_CONFIG}
        isAllSelected={false}
        searchColumns={searchColumns}
        sortColumns={sortColumns}
        onSearch={onSearch}
        onReplaceSearch={onReplaceSearch}
        onSort={onSort}
        onSelectAll={onSelectAll}
        showSelectAll
        isAllExpanded
        onExpandAll={onExpandAll}
      />
    );

    const expandButton = screen.getByRole('button', {
      name: 'Expand all rows',
    });
    expect(
      within(expandButton).getByLabelText('Is expanded')
    ).toBeInTheDocument();
  });
});
