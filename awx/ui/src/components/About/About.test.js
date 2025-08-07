import React from 'react';
import { mountWithContexts } from '../../../testUtils/enzymeHelpers';
import About from './About';

jest.mock('../../hooks/useBrandName', () => ({
  __esModule: true,
  default: () => 'AWX',
}));

describe('<About />', () => {
  test('should render AboutModal', () => {
    const onClose = jest.fn();
    const wrapper = mountWithContexts(<About isOpen onClose={onClose} />);

    const modal = wrapper.find('AboutModal');
    expect(modal).toHaveLength(1);
    expect(modal.prop('onClose')).toEqual(onClose);
    expect(modal.prop('productName')).toEqual('AWX');
    expect(modal.prop('isOpen')).toEqual(true);
  });
});
