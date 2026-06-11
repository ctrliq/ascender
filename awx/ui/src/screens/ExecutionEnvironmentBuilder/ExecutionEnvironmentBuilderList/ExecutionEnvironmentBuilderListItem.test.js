import React from 'react';
import { act } from 'react-dom/test-utils';

import { ExecutionEnvironmentBuildersAPI } from 'api';
import { mountWithContexts } from '../../../../testUtils/enzymeHelpers';

import ExecutionEnvironmentBuilderListItem from './ExecutionEnvironmentBuilderListItem';

jest.mock('../../../api');

describe('<ExecutionEnvironmentBuilderListItem/>', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  let wrapper;
  const executionEnvironmentBuilder = {
    id: 1,
    name: 'Builder One',
    image: 'my-custom-ee',
    tag: 'latest',
    summary_fields: {
      user_capabilities: { edit: true, copy: true, delete: true, start: true },
    },
  };

  test('should mount successfully', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <table>
          <tbody>
            <ExecutionEnvironmentBuilderListItem
              executionEnvironmentBuilder={executionEnvironmentBuilder}
              detailUrl="/execution_environment_builders/1"
              isSelected={false}
              onSelect={() => {}}
              onCopy={() => {}}
              rowIndex={0}
              fetchExecutionEnvironmentBuilders={() => {}}
            />
          </tbody>
        </table>
      );
    });
    expect(wrapper.find('ExecutionEnvironmentBuilderListItem').length).toBe(1);
  });

  test('should render the proper data', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <table>
          <tbody>
            <ExecutionEnvironmentBuilderListItem
              executionEnvironmentBuilder={executionEnvironmentBuilder}
              detailUrl="/execution_environment_builders/1"
              isSelected={false}
              onSelect={() => {}}
              onCopy={() => {}}
              rowIndex={0}
              fetchExecutionEnvironmentBuilders={() => {}}
            />
          </tbody>
        </table>
      );
    });
    expect(wrapper.find('TdBreakWord').text()).toBe(
      executionEnvironmentBuilder.name
    );
    expect(wrapper.find('Td[dataLabel="Image"]').text()).toBe(
      executionEnvironmentBuilder.image
    );
    expect(wrapper.find('Td[dataLabel="Tag"]').text()).toBe(
      executionEnvironmentBuilder.tag
    );
    expect(wrapper.find('PencilAltIcon').exists()).toBeTruthy();
    expect(wrapper.find('RocketIcon').exists()).toBeTruthy();
  });

  test('should call api to copy execution environment builder', async () => {
    ExecutionEnvironmentBuildersAPI.copy.mockResolvedValue({
      status: 201,
      data: { id: 2 },
    });

    const onCopy = jest.fn();
    const fetchBuilders = jest.fn().mockResolvedValue({});

    wrapper = mountWithContexts(
      <table>
        <tbody>
          <ExecutionEnvironmentBuilderListItem
            executionEnvironmentBuilder={executionEnvironmentBuilder}
            detailUrl="/execution_environment_builders/1"
            isSelected={false}
            onSelect={() => {}}
            onCopy={onCopy}
            rowIndex={0}
            fetchExecutionEnvironmentBuilders={fetchBuilders}
          />
        </tbody>
      </table>
    );

    await act(async () =>
      wrapper.find('Button[aria-label="Copy"]').prop('onClick')()
    );
    expect(ExecutionEnvironmentBuildersAPI.copy).toHaveBeenCalled();
  });

  test('should render proper alert modal on copy error', async () => {
    ExecutionEnvironmentBuildersAPI.copy.mockRejectedValue(new Error());

    wrapper = mountWithContexts(
      <table>
        <tbody>
          <ExecutionEnvironmentBuilderListItem
            executionEnvironmentBuilder={executionEnvironmentBuilder}
            detailUrl="/execution_environment_builders/1"
            isSelected={false}
            onSelect={() => {}}
            onCopy={() => {}}
            rowIndex={0}
            fetchExecutionEnvironmentBuilders={() => {}}
          />
        </tbody>
      </table>
    );

    await act(async () =>
      wrapper.find('Button[aria-label="Copy"]').prop('onClick')()
    );
    wrapper.update();
    expect(wrapper.find('Modal').prop('isOpen')).toBe(true);
  });

  test('should not render copy button when user lacks copy permission', async () => {
    wrapper = mountWithContexts(
      <table>
        <tbody>
          <ExecutionEnvironmentBuilderListItem
            executionEnvironmentBuilder={{
              ...executionEnvironmentBuilder,
              summary_fields: {
                user_capabilities: { copy: false, edit: true, delete: true, start: true },
              },
            }}
            detailUrl="/execution_environment_builders/1"
            isSelected={false}
            onSelect={() => {}}
            onCopy={() => {}}
            rowIndex={0}
            fetchExecutionEnvironmentBuilders={() => {}}
          />
        </tbody>
      </table>
    );
    expect(wrapper.find('CopyButton').length).toBe(0);
  });

  test('should not render edit button when user lacks edit permission', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <table>
          <tbody>
            <ExecutionEnvironmentBuilderListItem
              executionEnvironmentBuilder={{
                ...executionEnvironmentBuilder,
                summary_fields: {
                  user_capabilities: { edit: false, copy: true, delete: true, start: true },
                },
              }}
              detailUrl="/execution_environment_builders/1"
              isSelected={false}
              onSelect={() => {}}
              onCopy={() => {}}
              rowIndex={0}
              fetchExecutionEnvironmentBuilders={() => {}}
            />
          </tbody>
        </table>
      );
    });
    expect(wrapper.find('PencilAltIcon').exists()).toBeFalsy();
  });

  test('should not render launch button when user lacks start permission', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <table>
          <tbody>
            <ExecutionEnvironmentBuilderListItem
              executionEnvironmentBuilder={{
                ...executionEnvironmentBuilder,
                summary_fields: {
                  user_capabilities: { edit: true, copy: true, delete: true, start: false },
                },
              }}
              detailUrl="/execution_environment_builders/1"
              isSelected={false}
              onSelect={() => {}}
              onCopy={() => {}}
              rowIndex={0}
              fetchExecutionEnvironmentBuilders={() => {}}
            />
          </tbody>
        </table>
      );
    });
    expect(wrapper.find('RocketIcon').exists()).toBeFalsy();
  });

  test('should call launch api when launch button is clicked', async () => {
    ExecutionEnvironmentBuildersAPI.launch.mockResolvedValue({
      status: 201,
      data: { execution_environment_builder_build: 99 },
    });

    await act(async () => {
      wrapper = mountWithContexts(
        <table>
          <tbody>
            <ExecutionEnvironmentBuilderListItem
              executionEnvironmentBuilder={executionEnvironmentBuilder}
              detailUrl="/execution_environment_builders/1"
              isSelected={false}
              onSelect={() => {}}
              onCopy={() => {}}
              rowIndex={0}
              fetchExecutionEnvironmentBuilders={() => {}}
            />
          </tbody>
        </table>
      );
    });

    await act(async () => {
      wrapper.find('Button[aria-label="Launch"]').simulate('click');
    });
    expect(ExecutionEnvironmentBuildersAPI.launch).toHaveBeenCalledWith(
      1,
      { name: 'Builder One' }
    );
  });
});
