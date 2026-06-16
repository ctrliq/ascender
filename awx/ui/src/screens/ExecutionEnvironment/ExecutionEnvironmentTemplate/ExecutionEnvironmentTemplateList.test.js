import React from 'react';
import { screen } from '@testing-library/react';

import { ExecutionEnvironmentsAPI } from 'api';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ExecutionEnvironmentTemplateList from './ExecutionEnvironmentTemplateList';

jest.mock('../../../api/');

const templates = {
  data: {
    count: 3,
    results: [
      {
        id: 1,
        type: 'job_template',
        name: 'Foo',
        url: '/api/v2/job_templates/1/',
        related: { execution_environment: '/api/v2/execution_environments/1/' },
      },
      {
        id: 2,
        type: 'workflow_job_template',
        name: 'Bar',
        url: '/api/v2/workflow_job_templates/2/',
        related: { execution_environment: '/api/v2/execution_environments/1/' },
      },
      {
        id: 3,
        type: 'job_template',
        name: 'Fuzz',
        url: '/api/v2/job_templates/3/',
        related: { execution_environment: '/api/v2/execution_environments/1/' },
      },
    ],
  },
};

const mockExecutionEnvironment = { id: 1, name: 'Default EE' };
const options = { data: { actions: { GET: {} } } };

const renderList = () =>
  renderWithContexts(
    <ExecutionEnvironmentTemplateList
      executionEnvironment={mockExecutionEnvironment}
    />
  );

describe('<ExecutionEnvironmentTemplateList/>', () => {
  beforeEach(() => {
    ExecutionEnvironmentsAPI.readUnifiedJobTemplates.mockResolvedValue(
      templates
    );
    ExecutionEnvironmentsAPI.readUnifiedJobTemplateOptions.mockResolvedValue(
      options
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should fetch data and render 3 rows', async () => {
    renderList();
    expect(await screen.findByText('Foo')).toBeInTheDocument();
    expect(screen.getByText('Bar')).toBeInTheDocument();
    expect(screen.getByText('Fuzz')).toBeInTheDocument();
    expect(
      ExecutionEnvironmentsAPI.readUnifiedJobTemplates
    ).toHaveBeenCalled();
    expect(
      ExecutionEnvironmentsAPI.readUnifiedJobTemplateOptions
    ).toHaveBeenCalled();
  });

  test('should not render an add button', async () => {
    renderList();
    await screen.findByText('Foo');
    expect(screen.queryByRole('link', { name: 'Add' })).not.toBeInTheDocument();
  });
});
