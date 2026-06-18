import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import CheckboxListItem from './CheckboxListItem';

// CheckboxListItem renders a PF <Td select={...}> whose checkbox only renders
// inside a full PF Table context; mounted standalone here the row content and
// the Tr onClick selection behaviour are what we assert (the checkbox input is
// not reachable without that context).

describe('CheckboxListItem', () => {
  test('renders the expected content', () => {
    renderWithContexts(
      <table>
        <tbody>
          <CheckboxListItem
            itemId={1}
            name="Buzz"
            label="Buzz"
            isSelected={false}
            onSelect={() => {}}
            onDeselect={() => {}}
          />
        </tbody>
      </table>
    );
    expect(screen.getByText('Buzz')).toBeInTheDocument();
    expect(screen.getByRole('row')).toBeInTheDocument();
  });

  test('clicking an unselected row calls onSelect with the item id', async () => {
    const onSelect = jest.fn();
    const onDeselect = jest.fn();
    renderWithContexts(
      <table>
        <tbody>
          <CheckboxListItem
            itemId={7}
            name="Buzz"
            label="Buzz"
            isSelected={false}
            onSelect={onSelect}
            onDeselect={onDeselect}
          />
        </tbody>
      </table>
    );
    fireEvent.click(screen.getByRole('row'));
    expect(onSelect).toHaveBeenCalledWith(7);
    expect(onDeselect).not.toHaveBeenCalled();
  });

  test('clicking a selected row calls onDeselect with the item id', async () => {
    const onSelect = jest.fn();
    const onDeselect = jest.fn();
    renderWithContexts(
      <table>
        <tbody>
          <CheckboxListItem
            itemId={7}
            name="Buzz"
            label="Buzz"
            isSelected
            onSelect={onSelect}
            onDeselect={onDeselect}
          />
        </tbody>
      </table>
    );
    fireEvent.click(screen.getByRole('row'));
    expect(onDeselect).toHaveBeenCalledWith(7);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('should render row actions', () => {
    renderWithContexts(
      <table>
        <tbody>
          <CheckboxListItem
            itemId={1}
            name="Buzz"
            label="Buzz"
            isSelected={false}
            onSelect={() => {}}
            onDeselect={() => {}}
            rowActions={[
              <div id="1" key="1">
                action_1
              </div>,
              <div id="2" key="2">
                action_2
              </div>,
            ]}
          />
        </tbody>
      </table>
    );
    expect(screen.getByText('action_1')).toBeInTheDocument();
    expect(screen.getByText('action_2')).toBeInTheDocument();
  });
});
