import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import Templates from './Templates';

describe('<Templates />', () => {
  test('initially renders without crashing', () => {
    // Templates is a v6 descendant mounted at /templates/*; render it under the
    // same route. A non-matching subpath keeps its <Routes> from rendering a
    // child screen (which would fetch), so this stays a render-only smoke test.
    const history = createMemoryHistory({
      initialEntries: ['/templates/unknown'],
    });
    renderWithContexts(
      <Routes>
        <Route path="/templates/*" element={<Templates />} />
      </Routes>,
      { context: { router: { history } } }
    );
    // The ScreenHeader breadcrumb renders regardless of the matched route.
    expect(
      screen.getByRole('navigation', { name: 'Breadcrumb' })
    ).toBeInTheDocument();
  });
});
