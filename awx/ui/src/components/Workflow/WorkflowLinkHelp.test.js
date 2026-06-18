import React from 'react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import WorkflowLinkHelp from './WorkflowLinkHelp';

describe('WorkflowLinkHelp', () => {
  test('successfully mounts', () => {
    const { container } = renderWithContexts(<WorkflowLinkHelp link={{}} />);
    expect(
      container.querySelector('#workflow-link-help-type')
    ).toBeInTheDocument();
  });
  test('renders the expected content for an on success link', () => {
    const link = {
      linkType: 'success',
    };
    const { container } = renderWithContexts(<WorkflowLinkHelp link={link} />);
    expect(
      container.querySelector('#workflow-link-help-type')
    ).toHaveTextContent('On Success');
  });
  test('renders the expected content for an on failure link', () => {
    const link = {
      linkType: 'failure',
    };
    const { container } = renderWithContexts(<WorkflowLinkHelp link={link} />);
    expect(
      container.querySelector('#workflow-link-help-type')
    ).toHaveTextContent('On Failure');
  });
  test('renders the expected content for an always link', () => {
    const link = {
      linkType: 'always',
    };
    const { container } = renderWithContexts(<WorkflowLinkHelp link={link} />);
    expect(
      container.querySelector('#workflow-link-help-type')
    ).toHaveTextContent('Always');
  });
});
