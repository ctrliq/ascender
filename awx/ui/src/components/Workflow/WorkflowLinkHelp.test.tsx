import React from 'react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import WorkflowLinkHelp from './WorkflowLinkHelp';
import type { WorkflowLink } from './workflowReducer';

describe('WorkflowLinkHelp', () => {
  test('successfully mounts', () => {
    const { container } = renderWithContexts(
      <WorkflowLinkHelp link={{} as unknown as WorkflowLink} />
    );
    expect(
      container.querySelector('#workflow-link-help-type')
    ).toBeInTheDocument();
  });
  test('renders the expected content for an on success link', () => {
    const link = {
      linkType: 'success',
    };
    const { container } = renderWithContexts(
      <WorkflowLinkHelp link={link as unknown as WorkflowLink} />
    );
    expect(
      container.querySelector('#workflow-link-help-type')
    ).toHaveTextContent('On Success');
  });
  test('renders the expected content for an on failure link', () => {
    const link = {
      linkType: 'failure',
    };
    const { container } = renderWithContexts(
      <WorkflowLinkHelp link={link as unknown as WorkflowLink} />
    );
    expect(
      container.querySelector('#workflow-link-help-type')
    ).toHaveTextContent('On Failure');
  });
  test('renders the expected content for an always link', () => {
    const link = {
      linkType: 'always',
    };
    const { container } = renderWithContexts(
      <WorkflowLinkHelp link={link as unknown as WorkflowLink} />
    );
    expect(
      container.querySelector('#workflow-link-help-type')
    ).toHaveTextContent('Always');
  });
});
