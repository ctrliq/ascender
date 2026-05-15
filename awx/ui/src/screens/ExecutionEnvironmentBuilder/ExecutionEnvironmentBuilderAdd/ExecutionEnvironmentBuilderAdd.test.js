import React from 'react';
import { act } from 'react-dom/test-utils';
import { createMemoryHistory } from 'history';

import { ExecutionEnvironmentBuildersAPI } from 'api';
import {
  mountWithContexts,
  waitForElement,
} from '../../../../testUtils/enzymeHelpers';
import ExecutionEnvironmentBuilderAdd from './ExecutionEnvironmentBuilderAdd';

jest.mock('../../../api');

describe('<ExecutionEnvironmentBuilderAdd/>', () => {
  let wrapper;
  let history;

  beforeEach(async () => {
    history = createMemoryHistory({
      initialEntries: ['/execution_environment_builders/add'],
    });
    ExecutionEnvironmentBuildersAPI.create.mockResolvedValue({
      data: {
        id: 42,
      },
    });
    await act(async () => {
      wrapper = mountWithContexts(<ExecutionEnvironmentBuilderAdd />, {
        context: { router: { history } },
      });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render form', async () => {
    expect(wrapper.find('ExecutionEnvironmentBuilderForm').length).toBe(1);
  });

  test('handleSubmit should call the api and redirect to detail page', async () => {
    const formValues = {
      name: 'Test Builder',
      image: 'my-custom-ee',
      tag: 'latest',
      definition: '---\nversion: 3\n',
      credential: { id: 4, name: 'Container Registry' },
    };

    await act(async () => {
      wrapper.find('ExecutionEnvironmentBuilderForm').invoke('onSubmit')(
        formValues
      );
    });
    wrapper.update();
    expect(ExecutionEnvironmentBuildersAPI.create).toHaveBeenCalledWith({
      ...formValues,
      credential: 4,
    });
    expect(history.location.pathname).toBe(
      '/execution_environment_builders/42'
    );
  });

  test('handleSubmit should send null credential when not provided', async () => {
    const formValues = {
      name: 'Test Builder',
      image: 'my-custom-ee',
      tag: 'latest',
      definition: '---\nversion: 3\n',
      credential: null,
    };

    await act(async () => {
      wrapper.find('ExecutionEnvironmentBuilderForm').invoke('onSubmit')(
        formValues
      );
    });
    wrapper.update();
    expect(ExecutionEnvironmentBuildersAPI.create).toHaveBeenCalledWith({
      ...formValues,
      credential: null,
    });
  });

  test('handleCancel should return the user back to the list', async () => {
    wrapper.find('Button[aria-label="Cancel"]').simulate('click');
    expect(history.location.pathname).toEqual('/execution_environment_builders');
  });

  test('failed form submission should show an error message', async () => {
    const error = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    ExecutionEnvironmentBuildersAPI.create.mockImplementationOnce(() =>
      Promise.reject(error)
    );
    await act(async () => {
      wrapper.find('ExecutionEnvironmentBuilderForm').invoke('onSubmit')({
        name: 'Test Builder',
        image: 'my-custom-ee',
        tag: 'latest',
        definition: '---\nversion: 3\n',
        credential: null,
      });
    });
    wrapper.update();
    expect(wrapper.find('FormSubmitError').length).toBe(1);
  });
});
