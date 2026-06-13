import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import ContentLoading from './ContentLoading';

describe('ContentLoading', () => {
  test('renders the expected content', () => {
    renderWithContexts(<ContentLoading />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
