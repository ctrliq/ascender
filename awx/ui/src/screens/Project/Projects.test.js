import React from 'react';
import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import { _Projects as Projects } from './Projects';

// stub the list so the /projects route resolves without hitting the API
jest.mock('./ProjectList/ProjectList', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'ProjectsList'),
  };
});

describe('<Projects />', () => {
  test('should display a breadcrumb heading', () => {
    const history = createMemoryHistory({ initialEntries: ['/projects'] });
    renderWithContexts(
      <Routes>
        <Route path="/projects/*" element={<Projects />} />
      </Routes>,
      {
        context: { router: { history } },
      }
    );

    // ScreenHeader renders the "Projects" breadcrumb title for this route
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('ProjectsList')).toBeInTheDocument();
    // streamType="project" wires the activity stream link query param
    expect(
      screen.getByRole('link', { name: 'View activity stream' })
    ).toHaveAttribute('href', '/activity_stream?type=project');
  });
});
