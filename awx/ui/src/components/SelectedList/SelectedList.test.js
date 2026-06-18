import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import SelectedList from './SelectedList';

describe('<SelectedList />', () => {
  test('initially renders successfully', () => {
    const mockSelected = [
      {
        id: 1,
        name: 'foo',
      },
      {
        id: 2,
        name: 'bar',
      },
    ];
    renderWithContexts(
      <SelectedList
        label="Selectedeeee"
        selected={mockSelected}
        onRemove={() => {}}
      />
    );
    // the label and each selected item chip render
    expect(screen.getByText('Selectedeeee')).toBeInTheDocument();
    expect(screen.getByText('foo')).toBeInTheDocument();
    expect(screen.getByText('bar')).toBeInTheDocument();
  });

  test('caps visible chips at numChips and shows an overflow expander', () => {
    // With an empty list the ChipGroup renders no overflow chip. With 5+ items
    // the numChips={5} cap would surface a "N more" overflow chip; assert the
    // cap by rendering 6 items and checking exactly one item is hidden behind
    // the "1 more" expander (the DOM equivalent of ChipGroup's numChips={5}).
    const mockSelected = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      name: `item-${i + 1}`,
    }));
    renderWithContexts(
      <SelectedList
        label="Selected"
        selected={mockSelected}
        onRemove={() => {}}
      />
    );
    // five chips shown, the sixth collapsed behind the overflow expander
    expect(screen.getByText('item-1')).toBeInTheDocument();
    expect(screen.getByText('item-5')).toBeInTheDocument();
    expect(screen.queryByText('item-6')).not.toBeInTheDocument();
    expect(screen.getByText('1 more')).toBeInTheDocument();
  });

  test('Clicking remove on chip calls onRemove callback prop with correct params', async () => {
    const onRemove = jest.fn();
    const mockSelected = [
      {
        id: 1,
        name: 'foo',
      },
    ];
    const { user } = renderWithContexts(
      <SelectedList
        label="Selected"
        selected={mockSelected}
        onRemove={onRemove}
      />
    );
    await user.click(screen.getByRole('button', { name: /close foo/i }));
    expect(onRemove).toHaveBeenCalledWith({
      id: 1,
      name: 'foo',
    });
  });
});
