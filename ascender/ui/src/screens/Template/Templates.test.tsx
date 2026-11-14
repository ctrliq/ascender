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
    // An address the screen does not name is still inside the screen, so the
    // header says so rather than standing an empty title over an empty trail.
    expect(screen.getByRole('heading', { name: 'Templates' })).toBeVisible();
    expect(
      screen.queryByRole('navigation', { name: 'Breadcrumb' })
    ).not.toBeInTheDocument();
  });
});
