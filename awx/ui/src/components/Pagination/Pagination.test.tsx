import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import Pagination from './Pagination';

describe('Pagination', () => {
  test('renders the expected content', () => {
    renderWithContexts(<Pagination itemCount={0} max={9000} />);
    expect(
      screen.getByRole('navigation', { name: 'Pagination' })
    ).toBeInTheDocument();
  });
});
