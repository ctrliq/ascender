import React from 'react';
import { act } from 'react-dom/test-utils';
import { createMemoryHistory } from 'history';

import { ExecutionEnvironmentBuildersAPI, CredentialsAPI } from 'api';
import { mountWithContexts } from '../../../../testUtils/enzymeHelpers';

import ExecutionEnvironmentBuilderEdit from './ExecutionEnvironmentBuilderEdit';

jest.mock('../../../api');

const builderData = {
  id: 42,
  name: 'Test Builder',
  image: 'my-custom-ee',
  tag: 'latest',
  definition: '---\nversion: 3\n',
  summary_fields: {
    credential: {
      id: 4,
      name: 'Container Registry',
      kind: 'registry',
    },
  },
};

describe('<ExecutionEnvironmentBuilderEdit/>', () => {
  let wrapper;
  let history;
  let onUpdate;

  beforeAll(async () => {
    history = createMemoryHistory({
      initialEntries: ['/execution_environment_builders/42/edit'],
    });
    onUpdate = jest.fn();
    CredentialsAPI.read.mockResolvedValue({
      data: { results: [], count: 0 },
    });
    CredentialsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    });
    await act(async () => {
      wrapper = mountWithContexts(
        <ExecutionEnvironmentBuilderEdit
          builder={builderData}
          onUpdate={onUpdate}
        />,
        {
          context: { router: { history } },
        }
      );
    });
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  test('should render form', () => {
    expect(wrapper.find('ExecutionEnvironmentBuilderForm').length).toBe(1);
  });

  test('handleSubmit should call the api and redirect to detail page', async () => {
    const updatedValues = {
      name: 'Updated Builder',
      image: 'updated-ee',
      tag: 'v2',
      definition: '---\nversion: 3\n',
      credential: { id: 4, name: 'Container Registry' },
    };

    await act(async () => {
      wrapper.find('ExecutionEnvironmentBuilderForm').invoke('onSubmit')(
        updatedValues
      );
    });
    wrapper.update();
    expect(ExecutionEnvironmentBuildersAPI.update).toHaveBeenCalledWith(42, {
      ...updatedValues,
      credential: 4,
    });
    expect(onUpdate).toHaveBeenCalled();
    expect(history.location.pathname).toEqual(
      '/execution_environment_builders/42'
    );
  });

  test('should navigate to detail page when cancel is clicked', async () => {
    await act(async () => {
      wrapper.find('button[aria-label="Cancel"]').prop('onClick')();
    });
    expect(history.location.pathname).toEqual(
      '/execution_environment_builders/42'
    );
  });

  test('failed form submission should show an error message', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    ExecutionEnvironmentBuildersAPI.update.mockImplementationOnce(() =>
      Promise.reject(error)
    );
    await act(async () => {
      wrapper.find('ExecutionEnvironmentBuilderForm').invoke('onSubmit')({
        name: 'Test',
        image: 'img',
        tag: 'latest',
        definition: '---\n',
        credential: null,
      });
    });
    wrapper.update();
    expect(wrapper.find('FormSubmitError').length).toBe(1);
  });

  test('should render loading when builder is null', async () => {
    let loadingWrapper;
    await act(async () => {
      loadingWrapper = mountWithContexts(
        <ExecutionEnvironmentBuilderEdit builder={null} onUpdate={jest.fn()} />,
        {
          context: { router: { history } },
        }
      );
    });
    expect(loadingWrapper.text()).toContain('Loading');
  });
});
