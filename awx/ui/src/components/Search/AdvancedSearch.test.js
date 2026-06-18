import React from 'react';
import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import AdvancedSearch from './AdvancedSearch';

// The three key-building Selects are typeahead PF Selects scoped by ouia id.
// Each toggle is named "Options menu" and each has a "Clear all" button when it
// holds a selection, so we scope all interactions by the wrapping ouia element.
async function selectFrom(user, ouiaId, optionName) {
  const wrap = document.querySelector(`[data-ouia-component-id="${ouiaId}"]`);
  await user.click(within(wrap).getByRole('button', { name: 'Options menu' }));
  await user.click(await screen.findByRole('option', { name: optionName }));
}

async function clearFrom(user, ouiaId) {
  const wrap = document.querySelector(`[data-ouia-component-id="${ouiaId}"]`);
  await user.click(within(wrap).getByRole('button', { name: 'Clear all' }));
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
    const keyWrap = document.querySelector(
      '[data-ouia-component-id="set-key-typeahead"]'
    );
    await user.click(
      within(keyWrap).getByRole('button', { name: 'Options menu' })
    );
    // 'bar' is in both lists but must appear only once -> foo, bar, baz
    // scope to this Select so options from other Selects aren't counted
    expect(within(keyWrap).getAllByRole('option')).toHaveLength(3);
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
    await selectFrom(user, 'set-key-typeahead', 'bar');

    // Enter with an empty value must not fire onSearch
    fireEvent.keyDown(valueInput(), { key: 'Enter' });
    expect(advancedSearchMock).toHaveBeenCalledTimes(0);

    await setValueAndSubmit(user, 'foo');
    expect(advancedSearchMock).toHaveBeenCalledTimes(1);
  });

  test('Disable searchValue input until a key is set', async () => {
    // The key Select has no isCreatable affordance, so the enzyme suite drove
    // onCreateOption directly; here we select a real key option to enable input.
    const { user } = renderWithContexts(
      <AdvancedSearch
        onSearch={jest.fn()}
        searchableKeys={[{ key: 'foo', type: 'string' }]}
        relatedSearchableKeys={[]}
      />
    );
    expect(valueInput()).toBeDisabled();
    await selectFrom(user, 'set-key-typeahead', 'foo');
    expect(valueInput()).toBeEnabled();
  });

  test('Strip and__ set type from key', async () => {
    // searchableKeys provides 'foo' as a selectable option (the enzyme suite
    // created it via onCreateOption, which has no DOM affordance here).
    const advancedSearchMock = jest.fn();
    const { user } = renderWithContexts(
      <AdvancedSearch
        onSearch={advancedSearchMock}
        searchableKeys={[{ key: 'foo', type: 'string' }]}
        relatedSearchableKeys={[]}
      />
    );
    await selectFrom(user, 'set-type-typeahead', /^and/);
    await selectFrom(user, 'set-key-typeahead', 'foo');
    await setValueAndSubmit(user, 'bar');
    // the 'and' set type is stripped -> bare key
    expect(advancedSearchMock).toHaveBeenCalledWith('foo', 'bar');

    advancedSearchMock.mockClear();
    await selectFrom(user, 'set-type-typeahead', /^or/);
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
    // direct key 'foo' -> no lookup added
    await selectFrom(user, 'set-key-typeahead', 'foo');
    await setValueAndSubmit(user, 'bar');
    expect(advancedSearchMock).toHaveBeenCalledWith('foo', 'bar');

    // 'bar' is in both direct and related; the direct definition wins -> no lookup
    advancedSearchMock.mockClear();
    await selectFrom(user, 'set-key-typeahead', 'bar');
    await setValueAndSubmit(user, 'bar');
    expect(advancedSearchMock).toHaveBeenCalledWith('bar', 'bar');

    // 'baz' is a related-only key -> default name__icontains lookup
    advancedSearchMock.mockClear();
    await selectFrom(user, 'set-key-typeahead', 'baz');
    await setValueAndSubmit(user, 'bar');
    expect(advancedSearchMock).toHaveBeenCalledWith('baz__name__icontains', 'bar');

    // switching the related search type to "search" -> baz__search
    advancedSearchMock.mockClear();
    await selectFrom(user, 'set-key-typeahead', 'baz');
    await selectFrom(user, 'set-lookup-typeahead', /Fuzzy search on id/);
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
    await selectFrom(user, 'set-type-typeahead', /^or/);
    await selectFrom(user, 'set-key-typeahead', 'foo');
    await selectFrom(user, 'set-lookup-typeahead', /^exact/);
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
    await selectFrom(user, 'set-type-typeahead', /^or/);
    await selectFrom(user, 'set-key-typeahead', 'foo');
    await selectFrom(user, 'set-lookup-typeahead', /^exact/);
    await setValueAndSubmit(user, 'bar');
    expect(advancedSearchMock).toHaveBeenCalledWith('or__foo__exact', 'bar');
    expect(valueInput()).toHaveValue('');
  });

  test('typeahead onClear should remove key components', async () => {
    // The enzyme suite cleared all three typeaheads then asserted onSearch('', 'baz').
    // With a real DOM the value input is disabled once the key is cleared (the UI
    // forbids searching with no key), so we assert the DOM-observable outcome of
    // onClear instead: the prefix and key are removed and search is disabled again.
    const advancedSearchMock = jest.fn();
    const { user } = renderWithContexts(
      <AdvancedSearch
        onSearch={advancedSearchMock}
        searchableKeys={[{ key: 'foo', type: 'string' }]}
        relatedSearchableKeys={[]}
      />
    );
    await selectFrom(user, 'set-type-typeahead', /^or/);
    await selectFrom(user, 'set-key-typeahead', 'foo');
    await selectFrom(user, 'set-lookup-typeahead', /^exact/);
    await setValueAndSubmit(user, 'bar');
    expect(advancedSearchMock).toHaveBeenCalledWith('or__foo__exact', 'bar');

    // clearing the key auto-clears the lookup; then clear the set type
    await clearFrom(user, 'set-key-typeahead');
    await clearFrom(user, 'set-type-typeahead');

    expect(
      document.querySelector('[data-ouia-component-id="set-type-typeahead"] input')
    ).toHaveValue('');
    expect(
      document.querySelector('[data-ouia-component-id="set-key-typeahead"] input')
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
    const wrap = document.querySelector(
      '[data-ouia-component-id="set-type-typeahead"]'
    );
    await user.click(within(wrap).getByRole('button', { name: 'Options menu' }));
    // with negative filtering off, only "and" and "or" remain (no "not")
    // scope to this Select so options from other Selects aren't counted
    const options = within(wrap).getAllByRole('option');
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
    // pick the related-only key 'baz' so the related search type select renders
    await selectFrom(user, 'set-key-typeahead', 'baz');

    const wrap = document.querySelector(
      '[data-ouia-component-id="set-lookup-typeahead"]'
    );
    await user.click(within(wrap).getByRole('button', { name: 'Options menu' }));
    // with fuzzy filtering off, the "search" (fuzzy id/name/description) option
    // is removed -> name__icontains, name, id remain
    // scope to this Select so options from other Selects aren't counted
    const options = within(wrap).getAllByRole('option');
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
