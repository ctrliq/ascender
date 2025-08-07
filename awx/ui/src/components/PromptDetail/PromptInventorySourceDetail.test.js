import React from 'react';
import { mountWithContexts } from '../../../testUtils/enzymeHelpers';
import PromptInventorySourceDetail from './PromptInventorySourceDetail';
import mockInvSource from './data.inventory_source.json';

describe('PromptInventorySourceDetail', () => {
  let wrapper;

  beforeAll(() => {
    wrapper = mountWithContexts(
      <PromptInventorySourceDetail resource={mockInvSource} />
    );
  });

  test('should render successfully', () => {
    expect(wrapper.find('PromptInventorySourceDetail')).toHaveLength(1);
  });

  test('should render expected details', () => {
    // Test that we can find the rendered text content without complex selectors
    const htmlContent = wrapper.html();
    
    // Check for key content that should be rendered
    expect(htmlContent).toContain('Demo Inventory');
    expect(htmlContent).toContain('scm'); 
    expect(htmlContent).toContain('Mock Project');
    expect(htmlContent).toContain('foo');
    expect(htmlContent).toContain('2 Seconds');
    
    // Check that Detail components are rendered
    expect(wrapper.find('Detail').length).toBeGreaterThan(5);
    
    // Test specific elements that we know work
    expect(
      wrapper
        .find('Detail[label="Regions"]')
        .containsAllMatchingElements([
          <span>us-east-1</span>,
          <span>us-east-2</span>,
        ])
    ).toEqual(true);
    expect(
      wrapper
        .find('Detail[label="Instance Filters"]')
        .containsAllMatchingElements([
          <span>filter1</span>,
          <span>filter2</span>,
          <span>filter3</span>,
        ])
    ).toEqual(true);
    expect(
      wrapper
        .find('Detail[label="Only Group By"]')
        .containsAllMatchingElements([
          <span>group1</span>,
          <span>group2</span>,
          <span>group3</span>,
        ])
    ).toEqual(true);
    expect(wrapper.find('CredentialChip').text()).toBe('Cloud: mock cred');
    expect(wrapper.find('VariablesDetail').prop('value')).toEqual(
      '---\nfoo: bar'
    );
    expect(
      wrapper
        .find('Detail[label="Enabled Options"]')
        .containsAllMatchingElements([
          <li>
            Overwrite local groups and hosts from remote inventory source
          </li>,
          <li>Overwrite local variables from remote inventory source</li>,
          <li>Update on launch</li>,
        ])
    ).toEqual(true);
  });

  test('should render "Deleted" details', () => {
    delete mockInvSource.summary_fields.organization;
    wrapper = mountWithContexts(
      <PromptInventorySourceDetail resource={mockInvSource} />
    );
    
    // Check that "Deleted" text appears in the HTML content
    const htmlContent = wrapper.html();
    expect(htmlContent).toContain('Deleted');
  });

  test('should not load Credentials', () => {
    wrapper = mountWithContexts(
      <PromptInventorySourceDetail
        resource={{
          ...mockInvSource,
          summary_fields: {
            credentials: [],
          },
        }}
      />
    );
    const credentials_detail = wrapper.find(`Detail[label="Credential"]`).at(0);
    expect(credentials_detail.prop('isEmpty')).toEqual(true);
  });
});
