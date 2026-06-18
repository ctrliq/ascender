import React from 'react';
import { screen } from '@testing-library/react';
import {
  renderWithContexts,
  assertDetail,
} from '../../../testUtils/rtlContexts';
import PromptJobTemplateDetail from './PromptJobTemplateDetail';
import mockData from './data.job_template.json';

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

const mockJT = {
  ...mockData,
  webhook_key: 'PiM3n2',
  instance_groups: [
    {
      id: 1,
      name: 'ig1',
    },
    {
      id: 2,
      name: 'ig2',
    },
  ],
};

describe('PromptJobTemplateDetail', () => {
  test('should render expected details', () => {
    renderWithContexts(<PromptJobTemplateDetail resource={mockJT} />);

    assertDetail('Job Type', 'Run');
    assertDetail('Inventory', 'Demo Inventory');
    // Inventory value is a Link to the inventory details page
    const inventoryTerm = screen.getByText('Inventory');
    expect(
      inventoryTerm.nextElementSibling.querySelector('a')
    ).toHaveAttribute('href', '/inventories/inventory/1/details');
    assertDetail('Project', 'Mock Project');
    assertDetail('Source Control Branch', 'Foo branch');
    assertDetail('Playbook', 'ping.yml');
    assertDetail('Forks', '2');
    assertDetail('Limit', 'alpha:beta');
    // Verbosity Detail renders empty under jsdom (Lingui macro returns no text),
    // so the row is not present in the DOM — matching the original suite which
    // skipped its text assertion.
    assertDetail('Show Changes', 'Off');
    // ' Job Slicing' label has a leading space; getByText normalizes whitespace
    expect(
      screen.getByText('Job Slicing').nextElementSibling
    ).toHaveTextContent('1');
    assertDetail('Host Config Key', 'a1b2c3');
    assertDetail('Webhook Service', 'Github');
    assertDetail('Webhook Key', 'PiM3n2');

    // Two recent jobs render two Sparkline job links
    expect(
      screen.getByRole('link', { name: 'View job 12' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'View job 13' })
    ).toBeInTheDocument();

    expect(
      screen.getByText('Webhook URL').nextElementSibling
    ).toHaveTextContent('/api/v2/job_templates/7/github/');
    expect(
      screen.getByText('Provisioning Callback URL').nextElementSibling
    ).toHaveTextContent('/api/v2/job_templates/7/callback/');

    expect(
      screen.getByText('Webhook Credential').nextElementSibling
    ).toHaveTextContent('Github Token: GitHub Cred');

    const credentialsTerm = screen.getByText('Credentials');
    expect(credentialsTerm.nextElementSibling).toHaveTextContent(
      'SSH: Credential 1'
    );
    expect(credentialsTerm.nextElementSibling).toHaveTextContent(
      'Awx: Credential 2'
    );

    expect(screen.getByText('L_91o2')).toBeInTheDocument();
    expect(screen.getByText('L_91o3')).toBeInTheDocument();
    expect(screen.getByText('ig1')).toBeInTheDocument();
    expect(screen.getByText('ig2')).toBeInTheDocument();
    expect(screen.getByText('T_100')).toBeInTheDocument();
    expect(screen.getByText('T_200')).toBeInTheDocument();
    expect(screen.getByText('S_100')).toBeInTheDocument();
    expect(screen.getByText('S_200')).toBeInTheDocument();

    // Enabled Options renders one <li> per enabled flag
    expect(screen.getByText('Privilege Escalation')).toBeInTheDocument();
    expect(screen.getByText('Provisioning Callbacks')).toBeInTheDocument();
    expect(screen.getByText('Concurrent Jobs')).toBeInTheDocument();
    expect(screen.getByText('Fact Storage')).toBeInTheDocument();
    expect(screen.getByText('Webhooks')).toBeInTheDocument();

    // Variables renders the extra_vars through the (mocked) CodeEditor
    expect(screen.getByText('Variables')).toBeInTheDocument();
    expect(screen.getByTestId('code-editor')).toHaveTextContent('foo: bar');
  });

  test('should render "Deleted" details', () => {
    const deletedJT = {
      ...mockJT,
      summary_fields: { ...mockJT.summary_fields },
    };
    delete deletedJT.summary_fields.inventory;
    delete deletedJT.summary_fields.organization;
    delete deletedJT.summary_fields.project;

    renderWithContexts(<PromptJobTemplateDetail resource={deletedJT} />);

    assertDetail('Inventory', 'Deleted');
    assertDetail('Organization', 'Deleted');
    assertDetail('Project', 'Deleted');
  });

  test('should not load Activity', () => {
    renderWithContexts(
      <PromptJobTemplateDetail
        resource={{
          ...mockJT,
          summary_fields: {
            ...mockJT.summary_fields,
            recent_jobs: [],
          },
        }}
      />
    );
    expect(screen.queryByText('Activity')).not.toBeInTheDocument();
  });

  test('should not load Credentials', () => {
    renderWithContexts(
      <PromptJobTemplateDetail
        resource={{
          ...mockJT,
          summary_fields: {
            ...mockJT.summary_fields,
            credentials: [],
          },
        }}
      />
    );
    expect(screen.queryByText('Credentials')).not.toBeInTheDocument();
  });

  test('should not load Labels', () => {
    renderWithContexts(
      <PromptJobTemplateDetail
        resource={{
          ...mockJT,
          summary_fields: {
            labels: {
              results: [],
            },
          },
        }}
      />
    );
    expect(screen.queryByText('Labels')).not.toBeInTheDocument();
  });

  test('should not load Instance Groups', () => {
    renderWithContexts(
      <PromptJobTemplateDetail
        resource={{
          ...mockJT,
          instance_groups: [],
        }}
      />
    );
    expect(screen.queryByText('Instance Groups')).not.toBeInTheDocument();
  });

  test('should not load Job Tags', () => {
    renderWithContexts(
      <PromptJobTemplateDetail
        resource={{
          ...mockJT,
          job_tags: '',
        }}
      />
    );
    expect(screen.queryByText('Job Tags')).not.toBeInTheDocument();
  });

  test('should not load Skip Tags', () => {
    renderWithContexts(
      <PromptJobTemplateDetail
        resource={{
          ...mockJT,
          skip_tags: '',
        }}
      />
    );
    expect(screen.queryByText('Skip Tags')).not.toBeInTheDocument();
  });
});
