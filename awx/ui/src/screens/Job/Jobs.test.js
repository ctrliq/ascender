import React from 'react';
import { act } from 'react-dom/test-utils';
import { mountWithContexts } from '../../../testUtils/enzymeHelpers';
import Jobs from './Jobs';

jest.mock('../../api');

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useRouteMatch: () => ({
    path: '/',
  }),
}));

describe('<Jobs />', () => {
  test('initially renders successfully', async () => {
    let wrapper;
    await act(async () => {
      wrapper = mountWithContexts(<Jobs />);
    });
    expect(wrapper.find('JobList')).toHaveLength(1);
  });

  test('should display a breadcrumb heading', async () => {
    let wrapper;
    await act(async () => {
      wrapper = mountWithContexts(<Jobs />);
    });
    const screenHeader = wrapper.find('ScreenHeader');
    expect(screenHeader).toHaveLength(1);
    expect(screenHeader.prop('breadcrumbConfig')).toEqual({
      '/jobs': 'Jobs',
    });
  });
});
