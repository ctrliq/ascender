import React from 'react';
import { mountWithContexts } from '../../../testUtils/enzymeHelpers';
import Credentials from './Credentials';

describe('<Credentials />', () => {
  test('should set breadcrumb config', () => {
    const wrapper = mountWithContexts(<Credentials />);

    const header = wrapper.find('ScreenHeader');
    expect(header.prop('streamType')).toEqual('credential');
    expect(header.prop('breadcrumbConfig')).toEqual({
      '/credentials': 'Credentials',
      '/credentials/add': 'Create New Credential',
    });
  });
});
