import React from 'react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router-dom-v5-compat';
import { mountWithContexts } from '../../../testUtils/enzymeHelpers';

import Templates from './Templates';

describe('<Templates />', () => {
  let pageWrapper;

  beforeEach(() => {
    // Templates is a v6 descendant mounted at /templates/*; render it under the
    // same route. A non-matching subpath keeps its <Routes> from rendering a
    // child screen (which would fetch), so this stays a render-only smoke test.
    const history = createMemoryHistory({
      initialEntries: ['/templates/unknown'],
    });
    pageWrapper = mountWithContexts(
      <Routes>
        <Route path="/templates/*" element={<Templates />} />
      </Routes>,
      { context: { router: { history } } }
    );
  });

  test('initially renders without crashing', () => {
    expect(pageWrapper.find('Templates').length).toBe(1);
  });
});
