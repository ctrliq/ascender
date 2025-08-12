import React from 'react';
import { mountWithContexts } from '../../../testUtils/enzymeHelpers';
import { _Projects as Projects } from './Projects';

describe('<Projects />', () => {
  test('should display a breadcrumb heading', () => {
    const wrapper = mountWithContexts(<Projects />);

    const header = wrapper.find('ScreenHeader');
    expect(header.prop('streamType')).toBe('project');
    expect(header.prop('breadcrumbConfig')).toEqual({
      '/projects': 'Projects',
      '/projects/add': 'Create New Project',
    });
  });
});
