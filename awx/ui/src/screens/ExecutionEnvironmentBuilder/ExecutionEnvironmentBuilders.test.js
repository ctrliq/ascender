import React from 'react';

import { mountWithContexts } from '../../../testUtils/enzymeHelpers';

import ExecutionEnvironmentBuilders from './ExecutionEnvironmentBuilders';

describe('<ExecutionEnvironmentBuilders/>', () => {
  let pageWrapper;
  let pageSections;

  beforeEach(() => {
    pageWrapper = mountWithContexts(<ExecutionEnvironmentBuilders />);
    pageSections = pageWrapper.find('PageSection');
  });

  test('initially renders without crashing', () => {
    expect(pageWrapper.length).toBe(1);
    expect(pageSections.length).toBe(1);
    expect(pageSections.first().props().variant).toBe('light');
  });
});
