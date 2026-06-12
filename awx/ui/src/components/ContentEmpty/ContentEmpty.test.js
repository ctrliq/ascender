import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import ContentEmpty from './ContentEmpty';

describe('ContentEmpty', () => {
  test('renders the expected content', () => {
    renderWithContexts(<ContentEmpty />);
    expect(screen.getByText('No items found.')).toBeInTheDocument();
  });
});
