import React from 'react';
import { screen, within } from '@testing-library/react';
import { getQSConfig } from 'util/qs';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import OptionsList from './OptionsList';

const qsConfig = getQSConfig('test', { order_by: 'foo' });

const options = [
  { id: 1, name: 'foo', url: '/item/1' },
  { id: 2, name: 'bar', url: '/item/2' },
  { id: 3, name: 'baz', url: '/item/3' },
];

describe('<OptionsList />', () => {
  it('should display list of options', () => {
    renderWithContexts(
      <OptionsList
        value={[]}
        options={options}
        optionCount={3}
        searchColumns={[
          { name: 'Foo', key: 'foo__icontains', isDefault: true },
        ]}
        sortColumns={[{ name: 'Foo', key: 'foo' }]}
        qsConfig={qsConfig}
        selectItem={() => {}}
        deselectItem={() => {}}
        name="Item"
      />
    );

    // one selectable (radio) row rendered per option
    expect(screen.getAllByRole('radio')).toHaveLength(options.length);
    options.forEach((opt) => {
      expect(screen.getByText(opt.name)).toBeInTheDocument();
    });

    // no selection preview when value is empty
    expect(
      screen.queryByRole('list', { name: 'Label group category' })
    ).toBeNull();
  });

  it('should render selected list', () => {
    renderWithContexts(
      <OptionsList
        value={[options[1]]}
        options={options}
        optionCount={3}
        searchColumns={[
          { name: 'Foo', key: 'foo__icontains', isDefault: true },
        ]}
        sortColumns={[{ name: 'Foo', key: 'foo' }]}
        qsConfig={qsConfig}
        selectItem={() => {}}
        deselectItem={() => {}}
        name="Item"
      />
    );

    // SelectedList renders its label and a chip for each selected item
    expect(screen.getByText('Selected')).toBeInTheDocument();
    const chipGroup = screen.getByRole('list', {
      name: 'Label group category',
    });
    const chips = within(chipGroup).getAllByRole('listitem');
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveTextContent('bar');
  });
});
