import React from 'react';
import { createMemoryHistory } from 'history';

import { mountWithContexts } from '../../../testUtils/enzymeHelpers';

import ManagementJobs from './ManagementJobs';

// stub the list so the /management_jobs route resolves without hitting the API
jest.mock('./ManagementJobList', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    default: () => ReactLib.createElement('div', null, 'ManagementJobList'),
  };
});

describe('<ManagementJobs />', () => {
  let pageWrapper;

  beforeEach(() => {
    const history = createMemoryHistory({
      initialEntries: ['/management_jobs'],
    });
    pageWrapper = mountWithContexts(<ManagementJobs />, {
      context: { router: { history } },
    });
  });

  test('renders the list at /management_jobs', () => {
    expect(pageWrapper.length).toBe(1);
    expect(pageWrapper.find('ScreenHeader').length).toBe(1);
    expect(pageWrapper.text()).toContain('ManagementJobList');
  });
});
