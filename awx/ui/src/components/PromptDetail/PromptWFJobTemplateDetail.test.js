import React from 'react';
import { screen } from '@testing-library/react';
import {
  renderWithContexts,
  assertDetail,
} from '../../../testUtils/rtlContexts';
import PromptWFJobTemplateDetail from './PromptWFJobTemplateDetail';
import mockData from './data.workflow_template.json';

const mockWF = {
  ...mockData,
  webhook_key: 'Pim3mRXT0',
};

describe('PromptWFJobTemplateDetail', () => {
  test('should render expected details', () => {
    renderWithContexts(<PromptWFJobTemplateDetail resource={mockWF} />);

    // Activity row renders a Sparkline (one job link for the single recent job)
    expect(
      screen.getByRole('link', { name: 'View job 226' })
    ).toBeInTheDocument();
    assertDetail('Inventory', 'Mock Smart Inv');
    assertDetail('Source Control Branch', '/bar/');
    assertDetail('Limit', 'hosts1,hosts2');
    assertDetail('Webhook Service', 'Github');
    assertDetail('Webhook Key', 'Pim3mRXT0');

    const webhookUrlTerm = screen.getByText('Webhook URL');
    expect(webhookUrlTerm.nextElementSibling).toHaveTextContent(
      '/api/v2/workflow_job_templates/47/github/'
    );

    // Enabled Options renders one <li> per enabled flag
    expect(screen.getByText('Concurrent Jobs')).toBeInTheDocument();
    expect(screen.getByText('Webhooks')).toBeInTheDocument();

    // Webhook Credential chip
    const webhookCredTerm = screen.getByText('Webhook Credential');
    expect(webhookCredTerm.nextElementSibling).toHaveTextContent(
      'Github Token: github'
    );

    // Labels chips
    expect(screen.getByText('L_10o0')).toBeInTheDocument();
    expect(screen.getByText('L_20o0')).toBeInTheDocument();

    // Variables uses react-ace (empty under jsdom); assert the surrounding label
    expect(screen.getByText('Variables')).toBeInTheDocument();
  });

  test('should not load Activity', () => {
    renderWithContexts(
      <PromptWFJobTemplateDetail
        resource={{
          ...mockWF,
          summary_fields: {
            recent_jobs: [],
          },
        }}
      />
    );
    // isEmpty Activity Detail renders nothing, so the label is absent
    expect(screen.queryByText('Activity')).not.toBeInTheDocument();
  });

  test('should not load Labels', () => {
    renderWithContexts(
      <PromptWFJobTemplateDetail
        resource={{
          ...mockWF,
          summary_fields: {
            labels: {
              results: [],
            },
          },
        }}
      />
    );
    // isEmpty Labels Detail renders nothing, so the label is absent
    expect(screen.queryByText('Labels')).not.toBeInTheDocument();
  });
});
