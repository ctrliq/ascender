import React from 'react';
import { createMemoryHistory } from 'history';
import { Routes, Route } from 'react-router-dom-v5-compat';
import { mountWithContexts } from '../../../testUtils/enzymeHelpers';
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
    const wrapper = mountWithContexts(
      <Routes>
        <Route path="/projects/*" element={<Projects />} />
      </Routes>,
      { context: { router: { history } } }
    );

    const header = wrapper.find('ScreenHeader');
    expect(header.prop('streamType')).toBe('project');
    expect(header.prop('breadcrumbConfig')).toEqual({
      '/projects': 'Projects',
      '/projects/add': 'Create New Project',
    });
  });
});
