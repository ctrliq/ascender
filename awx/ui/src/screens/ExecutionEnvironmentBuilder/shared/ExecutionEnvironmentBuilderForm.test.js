import React from 'react';
import { act } from 'react-dom/test-utils';
import { CredentialsAPI } from 'api';
import {
  mountWithContexts
} from '../../../../testUtils/enzymeHelpers';

import ExecutionEnvironmentBuilderForm from './ExecutionEnvironmentBuilderForm';

jest.mock('../../../api');

describe('<ExecutionEnvironmentBuilderForm/>', () => {
  let wrapper;
  let onCancel;
  let onSubmit;

  const executionEnvironmentBuilder = {
    id: 16,
    name: 'Test Builder',
    image: 'my-custom-ee',
    tag: 'v1',
    definition: '---\nversion: 3\n',
    summary_fields: {
      credential: {
        id: 4,
        name: 'Container Registry',
        kind: 'registry',
      },
    },
  };

  beforeEach(async () => {
    onCancel = jest.fn();
    onSubmit = jest.fn();
    CredentialsAPI.read.mockResolvedValue({
      data: { results: [], count: 0 },
    });
    CredentialsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    });
    await act(async () => {
      wrapper = mountWithContexts(
        <ExecutionEnvironmentBuilderForm
          onCancel={onCancel}
          onSubmit={onSubmit}
          executionEnvironmentBuilder={executionEnvironmentBuilder}
        />
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initially renders successfully', () => {
    expect(wrapper.length).toBe(1);
  });

  test('should display form fields properly', () => {
    expect(wrapper.find('FormField[name="name"]').length).toBe(1);
    expect(wrapper.find('FormField[name="image"]').length).toBe(1);
    expect(wrapper.find('FormField[name="tag"]').length).toBe(1);
    expect(wrapper.find('CredentialLookup').length).toBe(1);
    expect(wrapper.find('VariablesField').length).toBe(1);
  });

  test('should call onSubmit when form submitted', async () => {
    expect(onSubmit).not.toHaveBeenCalled();
    await act(async () => {
      wrapper.find('button[aria-label="Save"]').simulate('click');
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('should update form values', async () => {
    await act(async () => {
      wrapper.find('input#eeb-name').simulate('change', {
        target: { value: 'Updated Name', name: 'name' },
      });
      wrapper.find('input#eeb-image').simulate('change', {
        target: { value: 'updated-image', name: 'image' },
      });
      wrapper.find('input#eeb-tag').simulate('change', {
        target: { value: 'v2', name: 'tag' },
      });
      wrapper.find('CredentialLookup').invoke('onBlur')();
      wrapper.find('CredentialLookup').invoke('onChange')({
        id: 99,
        name: 'New Credential',
      });
    });

    wrapper.update();
    expect(wrapper.find('input#eeb-name').prop('value')).toEqual(
      'Updated Name'
    );
    expect(wrapper.find('input#eeb-image').prop('value')).toEqual(
      'updated-image'
    );
    expect(wrapper.find('input#eeb-tag').prop('value')).toEqual('v2');
    expect(wrapper.find('CredentialLookup').prop('value')).toEqual({
      id: 99,
      name: 'New Credential',
    });
  });

  test('should call handleCancel when Cancel button is clicked', async () => {
    expect(onCancel).not.toHaveBeenCalled();
    wrapper.find('button[aria-label="Cancel"]').invoke('onClick')();
    expect(onCancel).toHaveBeenCalled();
  });

  test('should render with default values for new builder', async () => {
    let newWrapper;
    await act(async () => {
      newWrapper = mountWithContexts(
        <ExecutionEnvironmentBuilderForm
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      );
    });
    expect(newWrapper.find('input#eeb-name').prop('value')).toEqual('');
    expect(newWrapper.find('input#eeb-tag').prop('value')).toEqual('latest');
  });

  test('should show submit error when submitError prop is provided', async () => {
    const submitError = {
      response: {
        data: { detail: 'An error occurred' },
      },
    };
    let errorWrapper;
    await act(async () => {
      errorWrapper = mountWithContexts(
        <ExecutionEnvironmentBuilderForm
          onCancel={onCancel}
          onSubmit={onSubmit}
          executionEnvironmentBuilder={executionEnvironmentBuilder}
          submitError={submitError}
        />
      );
    });
    expect(errorWrapper.find('FormSubmitError').length).toBe(1);
  });

  test('should populate credential from builder summary_fields', async () => {
    expect(wrapper.find('CredentialLookup').prop('value')).toEqual({
      id: 4,
      name: 'Container Registry',
      kind: 'registry',
    });
  });
});
