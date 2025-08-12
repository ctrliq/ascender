import React from 'react';
import { mountWithContexts } from '../../../testUtils/enzymeHelpers';
import StatusLabel from './StatusLabel';

describe('StatusLabel', () => {
  test('should render success', () => {
    const wrapper = mountWithContexts(<StatusLabel status="success" />);
    expect(wrapper).toHaveLength(1);
    expect(wrapper.find('CheckCircleIcon')).toHaveLength(1);
    expect(wrapper.find('Label').prop('color')).toEqual('green');
    expect(wrapper.text()).toEqual('Success');
    expect(wrapper.find('Tooltip')).toHaveLength(0);
  });

  test('should render failed', () => {
    const wrapper = mountWithContexts(<StatusLabel status="failed" />);
    expect(wrapper).toHaveLength(1);
    expect(wrapper.find('ExclamationCircleIcon')).toHaveLength(1);
    expect(wrapper.find('Label').prop('color')).toEqual('red');
    expect(wrapper.text()).toEqual('Failed');
  });

  test('should render error', () => {
    const wrapper = mountWithContexts(<StatusLabel status="error" />);
    expect(wrapper).toHaveLength(1);
    expect(wrapper.find('ExclamationCircleIcon')).toHaveLength(1);
    expect(wrapper.find('Label').prop('color')).toEqual('red');
    expect(wrapper.text()).toEqual('Error');
  });

  test('should render running', () => {
    const wrapper = mountWithContexts(<StatusLabel status="running" />);
    expect(wrapper).toHaveLength(1);
    expect(wrapper.find('SyncAltIcon')).toHaveLength(1);
    expect(wrapper.find('Label').prop('color')).toEqual('blue');
    expect(wrapper.text()).toEqual('Running');
  });

  test('should render pending', () => {
    const wrapper = mountWithContexts(<StatusLabel status="pending" />);
    expect(wrapper).toHaveLength(1);
    expect(wrapper.find('ClockIcon')).toHaveLength(1);
    expect(wrapper.find('Label').prop('color')).toEqual('blue');
    expect(wrapper.text()).toEqual('Pending');
  });

  test('should render waiting', () => {
    const wrapper = mountWithContexts(<StatusLabel status="waiting" />);
    expect(wrapper).toHaveLength(1);
    expect(wrapper.find('ClockIcon')).toHaveLength(1);
    expect(wrapper.find('Label').prop('color')).toEqual('grey');
    expect(wrapper.text()).toEqual('Waiting');
  });

  test('should render disabled', () => {
    const wrapper = mountWithContexts(<StatusLabel status="disabled" />);
    expect(wrapper).toHaveLength(1);
    expect(wrapper.find('MinusCircleIcon')).toHaveLength(1);
    expect(wrapper.find('Label').prop('color')).toEqual('grey');
    expect(wrapper.text()).toEqual('Disabled');
  });

  test('should render canceled', () => {
    const wrapper = mountWithContexts(<StatusLabel status="canceled" />);
    expect(wrapper).toHaveLength(1);
    expect(wrapper.find('ExclamationTriangleIcon')).toHaveLength(1);
    expect(wrapper.find('Label').prop('color')).toEqual('orange');
    expect(wrapper.text()).toEqual('Canceled');
  });

  test('should render tooltip', () => {
    const wrapper = mountWithContexts(
      <StatusLabel tooltipContent="Foo" status="success" />
    );
    expect(wrapper).toHaveLength(1);
    expect(wrapper.find('CheckCircleIcon')).toHaveLength(1);
    expect(wrapper.find('Label').prop('color')).toEqual('green');
    expect(wrapper.text()).toEqual('Success');
    expect(wrapper.find('Tooltip')).toHaveLength(1);
    expect(wrapper.find('Tooltip').prop('content')).toEqual('Foo');
  });

  test('should render children', () => {
    const wrapper = mountWithContexts(
      <StatusLabel tooltipContent="Foo" status="success" children="children" />
    );
    expect(wrapper.text()).toEqual('children');
  });
});
