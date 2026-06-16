import React from 'react';
import { screen } from '@testing-library/react';

import { renderWithContexts } from '../../../../testUtils/rtlContexts';

import ExecutionEnvironmentTemplateListItem from './ExecutionEnvironmentTemplateListItem';

const template = {
  id: 1,
  name: 'Foo',
  type: 'job_template',
};

const renderItem = (props = {}) =>
  renderWithContexts(
    <table>
      <tbody>
        <ExecutionEnvironmentTemplateListItem
          template={template}
          detailUrl={`/templates/${template.type}/${template.id}/details`}
          {...props}
        />
      </tbody>
    </table>
  );

describe('<ExecutionEnvironmentTemplateListItem/>', () => {
  test('should mount successfully and render a job template', () => {
    renderItem();
    expect(screen.getByText('Foo')).toBeInTheDocument();
    expect(screen.getByText('Job Template')).toBeInTheDocument();
  });

  test('should distinguish workflow job templates', () => {
    renderItem({ template: { ...template, type: 'workflow_job_template' } });
    expect(screen.getByText('Workflow Job Template')).toBeInTheDocument();
  });
});
