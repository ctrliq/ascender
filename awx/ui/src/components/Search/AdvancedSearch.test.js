import React from 'react';
import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import AdvancedSearch from './AdvancedSearch';

async function selectFrom(user, inputLabel, optionName) {
  const input = screen.getByRole('textbox', { name: inputLabel });
  await user.click(input);
  const option = await screen.findByRole('option', { name: optionName });
  await user.click(option);
}

async function clearFrom(user, inputLabel) {
  const input = screen.getByRole('textbox', { name: inputLabel });
  const container = input.closest('.pf-v6-c-menu-toggle');
  await user.click(within(container).getByRole('button', { name: 'Clear' }));
}

function valueInput() {
  return screen.getByLabelText('Advanced search value input');
}

async function setValueAndSubmit(user, value) {
  const input = valueInput();
  await user.type(input, value);
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('<AdvancedSearch />', () => {
  test('Remove duplicates from searchableKeys/relatedSearchableKeys list', async () => {
    const { user } = renderWithContexts(
      <AdvancedSearch
        onSearch={jest.fn()}
        searchableKeys={[
          { key: 'foo', type: 'string' },
          { key: 'bar', type: 'string' },
        ]}
        relatedSearchableKeys={['bar', 'baz']}
      />
    );
    const input = screen.getByRole('textbox', { name: 'Key typeahead' });
    await user.click(input);
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option')).toHaveLength(3);
  });

  test("Don't call onSearch unless a search value is set", async () => {
    const advancedSearchMock = jest.fn();
    const { user } = renderWithContexts(
      <AdvancedSearch
        onSearch={advancedSearchMock}
        searchableKeys={[
          { key: 'foo', type: 'string' },
          { key: 'bar', type: 'string' },
        ]}
        relatedSearchableKeys={['bar', 'baz']}
      />
    );
    await selectFrom(user, 'Key typeahead', 'bar');

    fireEvent.keyDown(valueInput(), { key: 'Enter' });
    expect(advancedSearchMock).toHaveBeenCalledTimes(0);

    await setValueAndSubmit(user, 'foo');
    expect(advancedSearchMock).toHaveBeenCalledTimes(1);
  });

  test('Disable searchValue input until a key is set', async () => {
    const { user } = renderWithContexts(
      <AdvancedSearch
        onSearch={jest.fn()}
        searchableKeys={[{ key: 'foo', type: 'string' }]}
        relatedSearchableKeys={[]}
      />
    );
    expect(valueInput()).toBeDisabled();
    await selectFrom(user, 'Key typeahead', 'foo');
    expect(valueInput()).toBeEnabled();
  });

  test('Strip and__ set type from key', async () => {
    const advancedSearchMock = jest.fn();
    const { user } = renderWithContexts(
      <AdvancedSearch
        onSearch={advancedSearchMock}
        searchableKeys={[{ key: 'foo', type: 'string' }]}
        relatedSearchableKeys={[]}
      />
    );
    await selectFrom(user, 'Set type typeahead', /^and/);
    await selectFrom(user, 'Key typeahead', 'foo');
    await setValueAndSubmit(user, 'bar');
    expect(advancedSearchMock).toHaveBeenCalledWith('foo', 'bar');

    advancedSearchMock.mockClear();
    await selectFrom(user, 'Set type typeahead', /^or/);
    await setValueAndSubmit(user, 'bar');
    expect(advancedSearchMock).toHaveBeenCalledWith('or__foo', 'bar');
  });

  test('Add __search lookup to key when applicable', async () => {
    const advancedSearchMock = jest.fn();
    const { user } = renderWithContexts(
      <AdvancedSearch
        onSearch={advancedSearchMock}
        searchableKeys={[
          { key: 'foo', type: 'string' },
          { key: 'bar', type: 'string' },
        ]}
        relatedSearchableKeys={['bar', 'baz']}
      />
    );
    await selectFrom(user, 'Key typeahead', 'foo');
    await setValueAndSubmit(user, 'bar');
    expect(advancedSearchMock).toHaveBeenCalledWith('foo', 'bar');

    advancedSearchMock.mockClear();
    await selectFrom(user, 'Key typeahead', 'bar');
    await setValueAndSubmit(user, 'bar');
    expect(advancedSearchMock).toHaveBeenCalledWith('bar', 'bar');

    advancedSearchMock.mockClear();
    await selectFrom(user, 'Key typeahead', 'baz');
    await setValueAndSubmit(user, 'bar');
    expect(advancedSearchMock).toHaveBeenCalledWith('baz__name__icontains', 'bar');

    advancedSearchMock.mockClear();
    await selectFrom(user, 'Key typeahead', 'baz');
    await selectFrom(user, 'Related search type typeahead', /Fuzzy search on id/);
    await setValueAndSubmit(user, 'bar');
    expect(advancedSearchMock).toHaveBeenCalledWith('baz__search', 'bar');
  });

  test('Key should be properly constructed from three typeaheads', async () => {
    const advancedSearchMock = jest.fn();
    const { user } = renderWithContexts(
      <AdvancedSearch
        onSearch={advancedSearchMock}
        searchableKeys={[{ key: 'foo', type: 'string' }]}
        relatedSearchableKeys={[]}
      />
    );
    await selectFrom(user, 'Set type typeahead', /^or/);
    await selectFrom(user, 'Key typeahead', 'foo');
    await selectFrom(user, 'Lookup typeahead', /^exact/);
    await setValueAndSubmit(user, 'bar');
    expect(advancedSearchMock).toHaveBeenCalledWith('or__foo__exact', 'bar');
  });

  test('searchValue should clear after onSearch is called', async () => {
    const advancedSearchMock = jest.fn();
    const { user } = renderWithContexts(
      <AdvancedSearch
        onSearch={advancedSearchMock}
        searchableKeys={[{ key: 'foo', type: 'string' }]}
        relatedSearchableKeys={[]}
      />
    );
    await selectFrom(user, 'Set type typeahead', /^or/);
    await selectFrom(user, 'Key typeahead', 'foo');
    await selectFrom(user, 'Lookup typeahead', /^exact/);
    await setValueAndSubmit(user, 'bar');
    expect(advancedSearchMock).toHaveBeenCalledWith('or__foo__exact', 'bar');
    expect(valueInput()).toHaveValue('');
  });

  test('typeahead onClear should remove key components', async () => {
    const advancedSearchMock = jest.fn();
    const { user } = renderWithContexts(
      <AdvancedSearch
        onSearch={advancedSearchMock}
        searchableKeys={[{ key: 'foo', type: 'string' }]}
        relatedSearchableKeys={[]}
      />
    );
    await selectFrom(user, 'Set type typeahead', /^or/);
    await selectFrom(user, 'Key typeahead', 'foo');
    await selectFrom(user, 'Lookup typeahead', /^exact/);
    await setValueAndSubmit(user, 'bar');
    expect(advancedSearchMock).toHaveBeenCalledWith('or__foo__exact', 'bar');

    await clearFrom(user, 'Key typeahead');
    await clearFrom(user, 'Set type typeahead');

    expect(
      screen.getByRole('textbox', { name: 'Set type typeahead' })
    ).toHaveValue('');
    expect(
      screen.getByRole('textbox', { name: 'Key typeahead' })
    ).toHaveValue('');
    expect(valueInput()).toBeDisabled();
  });

  test('Remove not operator from set type', async () => {
    const { user } = renderWithContexts(
      <AdvancedSearch
        onSearch={jest.fn()}
        searchableKeys={[
          { key: 'foo', type: 'string' },
          { key: 'bar', type: 'string' },
        ]}
        relatedSearchableKeys={['bar', 'baz']}
        enableNegativeFiltering={false}
      />
    );
    const input = screen.getByRole('textbox', { name: 'Set type typeahead' });
    await user.click(input);
    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(screen.getByRole('option', { name: /^or/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^and/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: /^not/ })
    ).not.toBeInTheDocument();
  });

  test('Remove search option from related search type', async () => {
    const { user } = renderWithContexts(
      <AdvancedSearch
        onSearch={jest.fn()}
        searchableKeys={[
          { key: 'foo', type: 'string' },
          { key: 'bar', type: 'string' },
        ]}
        relatedSearchableKeys={['bar', 'baz']}
        enableRelatedFuzzyFiltering={false}
      />
    );
    await selectFrom(user, 'Key typeahead', 'baz');

    const lookupInput = screen.getByRole('textbox', {
      name: 'Related search type typeahead',
    });
    await user.click(lookupInput);
    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(
      screen.getByRole('option', { name: /Fuzzy search on name field/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /Exact search on id field/ })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole('option', {
          name: /Fuzzy search on id, name or description/,
        })
      ).not.toBeInTheDocument()
    );
  });
});
