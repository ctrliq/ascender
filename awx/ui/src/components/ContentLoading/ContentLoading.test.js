import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import ContentLoading from './ContentLoading';

describe('ContentLoading', () => {
  test('renders an accessible loading indicator', () => {
    renderWithContexts(<ContentLoading />);
    expect(
      screen.getByRole('progressbar', { name: 'Loading' })
    ).toBeInTheDocument();
  });

  test('renders skeleton placeholder lines', () => {
    const { container } = renderWithContexts(<ContentLoading />);
    expect(
      container.querySelectorAll('.pf-c-skeleton').length
    ).toBeGreaterThan(0);
  });
});
