import React from 'react';
import { mountWithContexts } from '../../../testUtils/enzymeHelpers';
import AllSchedules from './AllSchedules';

jest.mock('../../api');

describe('<AllSchedules />', () => {
  test('should set breadcrumb config', () => {
    const wrapper = mountWithContexts(<AllSchedules />);

    const header = wrapper.find('ScreenHeader');
    expect(header.prop('streamType')).toEqual('schedule');
    expect(header.prop('breadcrumbConfig')).toEqual({
      '/schedules': 'Schedules',
    });
  });
});
