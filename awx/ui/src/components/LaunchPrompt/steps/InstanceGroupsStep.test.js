import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
import { InstanceGroupsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import InstanceGroupsStep from './InstanceGroupsStep';

jest.mock('../../../api/models/InstanceGroups');

const instance_groups = [
  { id: 1, name: 'ig one', url: '/instance_groups/1' },
  { id: 2, name: 'ig two', url: '/instance_groups/2' },
  { id: 3, name: 'ig three', url: '/instance_groups/3' },
];

describe('InstanceGroupsStep', () => {
  beforeEach(() => {
    InstanceGroupsAPI.read.mockResolvedValue({
      data: {
        results: instance_groups,
        count: 3,
      },
    });

    InstanceGroupsAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
  });

  afterEach(() => jest.clearAllMocks());

  test('should load instance groups', async () => {
    renderWithContexts(
      <Formik initialValues={{ instance_groups: [] }}>
        <InstanceGroupsStep />
      </Formik>
    );

    await waitFor(() => expect(InstanceGroupsAPI.read).toHaveBeenCalled());
    expect(await screen.findByText('ig one')).toBeInTheDocument();
    expect(screen.getByText('ig two')).toBeInTheDocument();
    expect(screen.getByText('ig three')).toBeInTheDocument();
  });
});
