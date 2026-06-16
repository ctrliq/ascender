import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import SelectableCard from './SelectableCard';

describe('<SelectableCard />', () => {
  const onClick = jest.fn();

  test('initially renders without crashing when not selected', () => {
    renderWithContexts(
      <SelectableCard label="Foo" onClick={onClick} ariaLabel="card" />
    );
    expect(screen.getByRole('button', { name: 'card' })).toBeInTheDocument();
  });

  test('initially renders without crashing when selected', () => {
    renderWithContexts(
      <SelectableCard label="Foo" isSelected onClick={onClick} ariaLabel="card" />
    );
    expect(screen.getByRole('button', { name: 'card' })).toBeInTheDocument();
  });
});
