import React from 'react';
import { screen, within } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import TagMultiSelect from './TagMultiSelect';

function getChipGroup() {
  return screen.getByRole('group', { name: 'Chip group category' });
}

describe('<TagMultiSelect />', () => {
  it('should render Select with a chip per value', () => {
    renderWithContexts(<TagMultiSelect value="foo,bar" onChange={jest.fn()} />);
    const chips = within(getChipGroup()).getAllByRole('listitem');
    expect(chips).toHaveLength(2);
    expect(chips[0]).toHaveTextContent('foo');
    expect(chips[1]).toHaveTextContent('bar');
  });

  it('should not treat empty string as an option', async () => {
    const { user } = renderWithContexts(
      <TagMultiSelect value="" onChange={jest.fn()} />
    );
    expect(screen.queryByRole('group', { name: 'Chip group category' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Options menu' }));
    expect(
      screen.getByRole('button', { name: 'Options menu' })
    ).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.queryByRole('group', { name: 'Chip group category' })
    ).toBeNull();
  });

  it('should trigger onChange when an existing option is selected', async () => {
    const onChange = jest.fn();
    const { user } = renderWithContexts(
      <TagMultiSelect value="foo,bar" onChange={onChange} />
    );

    await user.click(screen.getByRole('button', { name: 'Options menu' }));
    // selecting an unselected typed option adds it to the value string
    const input = screen.getByRole('textbox');
    await user.type(input, 'baz');
    await user.click(screen.getByRole('option', { name: /Create.*baz/ }));

    expect(onChange).toHaveBeenCalledWith('foo,bar,baz');
  });
});
