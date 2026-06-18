import React from 'react';
import { screen } from '@testing-library/react';
import {
  renderWithContexts,
  assertDetail,
} from '../../../testUtils/rtlContexts';
import PromptInventorySourceDetail from './PromptInventorySourceDetail';
import mockInvSource from './data.inventory_source.json';

// Render the (otherwise Ace-backed) CodeEditor as plain text so VariablesDetail's
// computed value is assertable under jsdom.
jest.mock('components/CodeEditor/CodeEditor', () => {
  const ReactMock = require('react');
  return {
    __esModule: true,
    default: ({ value }) =>
      ReactMock.createElement('div', { 'data-testid': 'code-editor' }, value),
  };
});

describe('PromptInventorySourceDetail', () => {
  test('should render expected details', () => {
    renderWithContexts(
      <PromptInventorySourceDetail resource={mockInvSource} />
    );

    // Key content rendered across the detail rows
    expect(screen.getByText('Demo Inventory')).toBeInTheDocument();
    expect(screen.getByText('scm')).toBeInTheDocument();
    expect(screen.getByText('Mock Project')).toBeInTheDocument();
    expect(screen.getByText('2 Seconds')).toBeInTheDocument();
    assertDetail('Inventory File', 'foo');

    // Regions chips
    expect(screen.getByText('us-east-1')).toBeInTheDocument();
    expect(screen.getByText('us-east-2')).toBeInTheDocument();
    // Instance Filters chips
    expect(screen.getByText('filter1')).toBeInTheDocument();
    expect(screen.getByText('filter2')).toBeInTheDocument();
    expect(screen.getByText('filter3')).toBeInTheDocument();
    // Only Group By chips
    expect(screen.getByText('group1')).toBeInTheDocument();
    expect(screen.getByText('group2')).toBeInTheDocument();
    expect(screen.getByText('group3')).toBeInTheDocument();

    // Credential chip
    const credentialTerm = screen.getByText('Credential');
    expect(credentialTerm.nextElementSibling).toHaveTextContent(
      'Cloud: mock cred'
    );

    // Source Variables renders the source_vars through the (mocked) CodeEditor
    expect(screen.getByText('Source Variables')).toBeInTheDocument();
    expect(screen.getByTestId('code-editor')).toHaveTextContent('foo: bar');

    // Enabled Options renders one <li> per enabled flag
    expect(
      screen.getByText(
        'Overwrite local groups and hosts from remote inventory source'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('Overwrite local variables from remote inventory source')
    ).toBeInTheDocument();
    expect(screen.getByText('Update on launch')).toBeInTheDocument();
  });

  test('should render "Deleted" details', () => {
    const deletedInvSource = {
      ...mockInvSource,
      summary_fields: { ...mockInvSource.summary_fields },
    };
    delete deletedInvSource.summary_fields.organization;
    renderWithContexts(
      <PromptInventorySourceDetail resource={deletedInvSource} />
    );

    expect(screen.getByText('Deleted')).toBeInTheDocument();
  });

  test('should not load Credentials', () => {
    renderWithContexts(
      <PromptInventorySourceDetail
        resource={{
          ...mockInvSource,
          summary_fields: {
            ...mockInvSource.summary_fields,
            credentials: [],
          },
        }}
      />
    );
    // isEmpty Credential Detail renders nothing, so the label is absent
    expect(screen.queryByText('Credential')).not.toBeInTheDocument();
  });
});
