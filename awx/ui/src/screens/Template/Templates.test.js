import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import Templates from './Templates';

describe('<Templates />', () => {
  test('initially renders without crashing', () => {
    renderWithContexts(<Templates />);
    // The ScreenHeader breadcrumb renders regardless of the matched route,
    // which is the enzyme suite's "renders without crashing" proxy.
    expect(
      screen.getByRole('navigation', { name: 'Breadcrumb' })
    ).toBeInTheDocument();
  });
});
