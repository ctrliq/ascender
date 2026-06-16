import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import PromptInventorySourceDetail from './PromptInventorySourceDetail';
import mockInvSource from './data.inventory_source.json';

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

    // Variables uses react-ace (empty under jsdom); assert the surrounding label
    expect(screen.getByText('Source Variables')).toBeInTheDocument();

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
    delete mockInvSource.summary_fields.organization;
    renderWithContexts(
      <PromptInventorySourceDetail resource={mockInvSource} />
    );

    expect(screen.getByText('Deleted')).toBeInTheDocument();
  });

  test('should not load Credentials', () => {
    renderWithContexts(
      <PromptInventorySourceDetail
        resource={{
          ...mockInvSource,
          summary_fields: {
            credentials: [],
          },
        }}
      />
    );
    // isEmpty Credential Detail renders nothing, so the label is absent
    expect(screen.queryByText('Credential')).not.toBeInTheDocument();
  });
});
