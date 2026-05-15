import React from 'react';
import { act } from 'react-dom/test-utils';

import { ExecutionEnvironmentBuildersAPI } from 'api';
import {
  mountWithContexts,
  waitForElement,
} from '../../../../testUtils/enzymeHelpers';

import ExecutionEnvironmentBuilderList from './ExecutionEnvironmentBuilderList';

jest.mock('../../../api/models/ExecutionEnvironmentBuilders');

const executionEnvironmentBuilders = {
  data: {
    results: [
      {
        id: 1,
        name: 'Builder One',
        image: 'my-custom-ee',
        tag: 'latest',
        url: '/api/v2/execution_environment_builders/1/',
        summary_fields: {
          user_capabilities: { edit: true, delete: true, copy: true, start: true },
        },
      },
      {
        id: 2,
        name: 'Builder Two',
        image: 'another-ee',
        tag: 'v2',
        url: '/api/v2/execution_environment_builders/2/',
        summary_fields: {
          user_capabilities: { edit: false, delete: true, copy: false, start: false },
        },
      },
    ],
    count: 2,
  },
};

const options = { data: { actions: { POST: true } } };

describe('<ExecutionEnvironmentBuilderList/>', () => {
  let wrapper;

  beforeEach(() => {
    ExecutionEnvironmentBuildersAPI.read.mockResolvedValue(
      executionEnvironmentBuilders
    );
    ExecutionEnvironmentBuildersAPI.readOptions.mockResolvedValue(options);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should mount successfully', async () => {
    await act(async () => {
      wrapper = mountWithContexts(<ExecutionEnvironmentBuilderList />);
    });
    await waitForElement(
      wrapper,
      'ExecutionEnvironmentBuilderList',
      (el) => el.length > 0
    );
  });

  test('should have data fetched and render 2 rows', async () => {
    await act(async () => {
      wrapper = mountWithContexts(<ExecutionEnvironmentBuilderList />);
    });
    await waitForElement(
      wrapper,
      'ExecutionEnvironmentBuilderList',
      (el) => el.length > 0
    );

    expect(wrapper.find('ExecutionEnvironmentBuilderListItem').length).toBe(2);
    expect(ExecutionEnvironmentBuildersAPI.read).toHaveBeenCalled();
    expect(ExecutionEnvironmentBuildersAPI.readOptions).toHaveBeenCalled();
  });

  test('should delete items successfully', async () => {
    await act(async () => {
      wrapper = mountWithContexts(<ExecutionEnvironmentBuilderList />);
    });
    await waitForElement(
      wrapper,
      'ExecutionEnvironmentBuilderList',
      (el) => el.length > 0
    );

    await act(async () => {
      wrapper
        .find('ExecutionEnvironmentBuilderListItem')
        .at(0)
        .invoke('onSelect')();
    });
    wrapper.update();
    await act(async () => {
      wrapper
        .find('ExecutionEnvironmentBuilderListItem')
        .at(1)
        .invoke('onSelect')();
    });
    wrapper.update();
    await act(async () => {
      wrapper.find('ToolbarDeleteButton').invoke('onDelete')();
    });

    expect(ExecutionEnvironmentBuildersAPI.destroy).toHaveBeenCalledTimes(2);
  });

  test('should render deletion error modal', async () => {
    ExecutionEnvironmentBuildersAPI.destroy.mockRejectedValue(
      new Error({
        response: {
          config: {
            method: 'DELETE',
            url: '/api/v2/execution_environment_builders',
          },
          data: 'An error occurred',
        },
      })
    );
    await act(async () => {
      wrapper = mountWithContexts(<ExecutionEnvironmentBuilderList />);
    });
    await waitForElement(
      wrapper,
      'ExecutionEnvironmentBuilderList',
      (el) => el.length > 0
    );

    wrapper
      .find('ExecutionEnvironmentBuilderListItem')
      .at(0)
      .find('input')
      .simulate('change', 'a');
    wrapper.update();

    expect(
      wrapper
        .find('ExecutionEnvironmentBuilderListItem')
        .at(0)
        .find('input')
        .prop('checked')
    ).toBe(true);

    await act(async () =>
      wrapper.find('Button[aria-label="Delete"]').prop('onClick')()
    );
    wrapper.update();

    await waitForElement(
      wrapper,
      'Button[aria-label="confirm delete"]',
      (el) => el.length > 0
    );
    await act(async () =>
      wrapper.find('Button[aria-label="confirm delete"]').prop('onClick')()
    );
    wrapper.update();
    expect(wrapper.find('ErrorDetail').length).toBe(1);
  });

  test('should thrown content error', async () => {
    ExecutionEnvironmentBuildersAPI.read.mockRejectedValue(
      new Error({
        response: {
          config: {
            method: 'GET',
            url: '/api/v2/execution_environment_builders',
          },
          data: 'An error occurred',
        },
      })
    );
    await act(async () => {
      wrapper = mountWithContexts(<ExecutionEnvironmentBuilderList />);
    });
    await waitForElement(
      wrapper,
      'ExecutionEnvironmentBuilderList',
      (el) => el.length > 0
    );
  });

  test('should not render add button', async () => {
    ExecutionEnvironmentBuildersAPI.read.mockResolvedValue(
      executionEnvironmentBuilders
    );
    ExecutionEnvironmentBuildersAPI.readOptions.mockResolvedValue({
      data: { actions: { POST: false } },
    });
    await act(async () => {
      wrapper = mountWithContexts(<ExecutionEnvironmentBuilderList />);
    });
    await waitForElement(
      wrapper,
      'ExecutionEnvironmentBuilderList',
      (el) => el.length > 0
    );
    expect(wrapper.find('ToolbarAddButton').length).toBe(0);
  });
});
