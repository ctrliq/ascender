import React from 'react';
import { act } from 'react-dom/test-utils';
import { createMemoryHistory } from 'history';

import { ExecutionEnvironmentBuildersAPI } from 'api';
import {
  mountWithContexts,
  waitForElement,
} from '../../../../testUtils/enzymeHelpers';

import ExecutionEnvironmentBuilderDetails from './ExecutionEnvironmentBuilderDetails';

jest.mock('../../../api');

const builder = {
  id: 17,
  type: 'execution_environment_builder',
  url: '/api/v2/execution_environment_builders/17/',
  name: 'Test Builder',
  image: 'my-custom-ee',
  tag: 'latest',
  definition: '---\nversion: 3\n',
  created: '2024-09-17T20:14:15.408782Z',
  modified: '2024-09-17T20:14:15.408802Z',
  summary_fields: {
    user_capabilities: {
      edit: true,
      delete: true,
      copy: true,
      start: true,
    },
    credential: {
      id: 4,
      name: 'Container Registry',
    },
    organization: {
      id: 1,
      name: 'Default',
    },
    created_by: {
      id: 1,
      username: 'admin',
      first_name: '',
      last_name: '',
    },
    modified_by: {
      id: 1,
      username: 'admin',
      first_name: '',
      last_name: '',
    },
  },
};

describe('<ExecutionEnvironmentBuilderDetails/>', () => {
  let wrapper;

  test('should render details properly', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <ExecutionEnvironmentBuilderDetails builder={builder} isLoading={false} />
      );
    });
    wrapper.update();

    expect(wrapper.find('Detail[label="Name"]').prop('value')).toEqual(
      builder.name
    );
    expect(wrapper.find('Detail[label="Image"]').prop('value')).toEqual(
      builder.image
    );
    expect(wrapper.find('Detail[label="Tag"]').prop('value')).toEqual(
      builder.tag
    );
    expect(wrapper.find('VariablesDetail').length).toBe(1);
    expect(wrapper.find('Detail[label="Credential"]').prop('value')).toEqual(
      builder.summary_fields.credential.name
    );

    const dates = wrapper.find('UserDateDetail');
    expect(dates).toHaveLength(2);
    expect(dates.at(0).prop('date')).toEqual(builder.created);
    expect(dates.at(1).prop('date')).toEqual(builder.modified);
  });

  test('should render loading state', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <ExecutionEnvironmentBuilderDetails builder={null} isLoading />
      );
    });
    wrapper.update();
    expect(wrapper.find('ContentLoading').length).toBe(1);
  });

  test('should render not found when builder is null and not loading', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <ExecutionEnvironmentBuilderDetails builder={null} isLoading={false} />
      );
    });
    wrapper.update();
    expect(wrapper.text()).toContain('not found');
  });

  test('should show launch button for users with start permission', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <ExecutionEnvironmentBuilderDetails builder={builder} isLoading={false} />
      );
    });
    wrapper.update();
    const launchButton = wrapper.find(
      'Button[ouiaId="builder-detail-launch-button"]'
    );
    expect(launchButton.length).toBe(1);
    expect(launchButton.text()).toEqual('Launch');
  });

  test('should hide launch button for users without start permission', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <ExecutionEnvironmentBuilderDetails
          builder={{
            ...builder,
            summary_fields: {
              ...builder.summary_fields,
              user_capabilities: { ...builder.summary_fields.user_capabilities, start: false },
            },
          }}
          isLoading={false}
        />
      );
    });
    wrapper.update();
    expect(
      wrapper.find('Button[ouiaId="builder-detail-launch-button"]').length
    ).toBe(0);
  });

  test('should show edit button for users with edit permission', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <ExecutionEnvironmentBuilderDetails builder={builder} isLoading={false} />
      );
    });
    wrapper.update();
    const editButton = wrapper.find('Button').filterWhere(
      (n) => n.text() === 'Edit'
    );
    expect(editButton.length).toBe(1);
  });

  test('should hide edit button for users without edit permission', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <ExecutionEnvironmentBuilderDetails
          builder={{
            ...builder,
            summary_fields: {
              ...builder.summary_fields,
              user_capabilities: { ...builder.summary_fields.user_capabilities, edit: false },
            },
          }}
          isLoading={false}
        />
      );
    });
    wrapper.update();
    const editButtons = wrapper.find('Button').filterWhere(
      (n) => n.text() === 'Edit'
    );
    expect(editButtons.length).toBe(0);
  });

  test('should show delete button for users with delete permission', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <ExecutionEnvironmentBuilderDetails builder={builder} isLoading={false} />
      );
    });
    wrapper.update();
    expect(wrapper.find('DeleteButton').length).toBe(1);
  });

  test('should hide delete button for users without delete permission', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <ExecutionEnvironmentBuilderDetails
          builder={{
            ...builder,
            summary_fields: {
              ...builder.summary_fields,
              user_capabilities: { ...builder.summary_fields.user_capabilities, delete: false },
            },
          }}
          isLoading={false}
        />
      );
    });
    wrapper.update();
    expect(wrapper.find('DeleteButton').length).toBe(0);
  });

  test('expected api call is made for delete', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/execution_environment_builders/17/details'],
    });
    await act(async () => {
      wrapper = mountWithContexts(
        <ExecutionEnvironmentBuilderDetails builder={builder} isLoading={false} />,
        {
          context: { router: { history } },
        }
      );
    });
    await act(async () => {
      wrapper.find('DeleteButton').invoke('onConfirm')();
    });
    expect(ExecutionEnvironmentBuildersAPI.destroy).toHaveBeenCalledTimes(1);
    expect(history.location.pathname).toBe('/execution_environment_builders');
  });

  test('should call launch api when launch button is clicked', async () => {
    ExecutionEnvironmentBuildersAPI.launch.mockResolvedValue({
      status: 201,
      data: { execution_environment_builder_build: 99 },
    });
    const history = createMemoryHistory({
      initialEntries: ['/execution_environment_builders/17/details'],
    });

    await act(async () => {
      wrapper = mountWithContexts(
        <ExecutionEnvironmentBuilderDetails builder={builder} isLoading={false} />,
        {
          context: { router: { history } },
        }
      );
    });

    await act(async () => {
      wrapper
        .find('Button[ouiaId="builder-detail-launch-button"]')
        .simulate('click');
    });
    expect(ExecutionEnvironmentBuildersAPI.launch).toHaveBeenCalledWith(17, {
      name: 'Test Builder',
    });
  });

  test('should render organization detail', async () => {
    await act(async () => {
      wrapper = mountWithContexts(
        <ExecutionEnvironmentBuilderDetails builder={builder} isLoading={false} />
      );
    });
    wrapper.update();
    expect(wrapper.find('Detail[label="Organization"]').length).toBe(1);
  });

  test('should not render organization detail when not present', async () => {
    const builderWithoutOrg = {
      ...builder,
      summary_fields: {
        ...builder.summary_fields,
        organization: undefined,
      },
    };
    await act(async () => {
      wrapper = mountWithContexts(
        <ExecutionEnvironmentBuilderDetails
          builder={builderWithoutOrg}
          isLoading={false}
        />
      );
    });
    wrapper.update();
    expect(wrapper.find('Detail[label="Organization"]').length).toBe(0);
  });
});
