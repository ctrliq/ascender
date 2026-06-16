import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import CheckboxCard from './CheckboxCard';

describe('<CheckboxCard />', () => {
  test('initially renders without crashing', () => {
    renderWithContexts(<CheckboxCard name="Foobar" itemId={5} />);
    expect(screen.getByRole('checkbox', { name: 'Foobar' })).toBeInTheDocument();
  });
});
