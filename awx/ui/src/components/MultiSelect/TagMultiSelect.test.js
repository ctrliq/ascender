import React from 'react';
import { screen, within } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import TagMultiSelect from './TagMultiSelect';

function getLabelGroup() {
  return screen.getByRole('list', { name: 'Label group category' });
}

describe('<TagMultiSelect />', () => {
  it('should render Select with a chip per value', () => {
    renderWithContexts(<TagMultiSelect value="foo,bar" onChange={jest.fn()} />);
    const chips = within(getLabelGroup()).getAllByRole('listitem');
    expect(chips).toHaveLength(2);
    expect(chips[0]).toHaveTextContent('foo');
    expect(chips[1]).toHaveTextContent('bar');
  });

  it('should not treat empty string as an option', async () => {
    const { user } = renderWithContexts(
      <TagMultiSelect value="" onChange={jest.fn()} />
    );
    expect(screen.queryByRole('list', { name: 'Label group category' })).toBeNull();

    const input = screen.getByRole('textbox', { name: 'Select tags' });
    await user.click(input);
    expect(
      screen.queryByRole('list', { name: 'Label group category' })
    ).toBeNull();
  });

  it('should trigger onChange when an existing option is selected', async () => {
    const onChange = jest.fn();
    const { user } = renderWithContexts(
      <TagMultiSelect value="foo,bar" onChange={onChange} />
    );

    const input = screen.getByRole('textbox');
    await user.click(input);
    await user.type(input, 'baz');
    await user.click(screen.getByRole('option', { name: /Create.*baz/ }));

    expect(onChange).toHaveBeenCalledWith('foo,bar,baz');
  });
});
