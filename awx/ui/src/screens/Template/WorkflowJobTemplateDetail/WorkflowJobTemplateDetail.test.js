import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';

import { WorkflowJobTemplateNodesAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import WorkflowJobTemplateDetail from './WorkflowJobTemplateDetail';

jest.mock('../../../api');

// Detail renders <div><dt>label</dt><dd>value</dd></div>; return the dd cell for
// a given Detail label so tests can assert on its contents.
function getDetailValue(label) {
  return screen.getByText(label).nextElementSibling;
}

describe('<WorkflowJobTemplateDetail/>', () => {
  const template = {
    id: 1,
    name: 'WFJT Template',
    description: 'Yo, it is a wfjt template!',
    type: 'workflow_job_template',
    extra_vars: '1: 2',
    created: '2015-07-07T17:21:26.429745Z',
    modified: '2019-08-11T19:47:37.980466Z',
    related: { webhook_receiver: '/api/v2/workflow_job_templates/45/github/' },
    summary_fields: {
      created_by: { id: 1, username: 'Athena' },
      modified_by: { id: 1, username: 'Apollo' },
      organization: { id: 1, name: 'Org' },
      inventory: { kind: 'Foo', id: 1, name: 'Bar' },
      labels: {
        results: [
          { name: 'Label 1', id: 1 },
          { name: 'Label 2', id: 2 },
          { name: 'Label 3', id: 3 },
        ],
      },
      recent_jobs: [
        { id: 1, status: 'run' },
        { id: 2, status: 'run' },
        { id: 3, status: 'run' },
      ],
      webhook_credential: { id: '1', name: 'Credential', kind: 'machine' },
      user_capabilities: { edit: true, delete: true },
    },
    webhook_service: 'Github',
    webhook_key: 'Foo webhook key',
    scm_branch: 'main',
    limit: 'servers',
  };

  beforeEach(() => {
    WorkflowJobTemplateNodesAPI.read.mockResolvedValue({ data: { count: 0 } });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const renderDetail = (tmpl = template) =>
    renderWithContexts(<WorkflowJobTemplateDetail template={tmpl} />);

  test('renders successfully', () => {
    renderDetail();
    expect(screen.getByText('WFJT Template')).toBeInTheDocument();
  });

  test('expect detail fields to render properly', () => {
    renderDetail();

    assertDetail('Created', '7/7/2015');
    assertDetail('Modified', '8/11/2019');
    assertDetail(
      'Webhook URL',
      'http://localhost/api/v2/workflow_job_templates/45/github/'
    );
    assertDetail('Source Control Branch', 'main');
    assertDetail('Limit', 'servers');
    assertDetail('Webhook Service', 'Github');
    assertDetail('Webhook Key', 'Foo webhook key');
    assertDetail('Name', 'WFJT Template');
    assertDetail('Description', 'Yo, it is a wfjt template!');
    assertDetail('Job Type', 'Workflow Job Template');

    // Organization renders a label inside a link
    const organization = getDetailValue('Organization');
    expect(organization).toHaveTextContent('Org');
    // Inventory renders a link to the inventory's name
    const inventory = getDetailValue('Inventory');
    expect(inventory).toHaveTextContent('Bar');

    // three labels render as chips
    const labels = getDetailValue('Labels');
    expect(within(labels).getByText('Label 1')).toBeInTheDocument();
    expect(within(labels).getByText('Label 2')).toBeInTheDocument();
    expect(within(labels).getByText('Label 3')).toBeInTheDocument();

    // three recent jobs render as sparkline links
    const activity = getDetailValue('Activity');
    expect(within(activity).getAllByRole('link')).toHaveLength(3);
  });

  test('should have proper number of delete detail requests', async () => {
    const { user } = renderDetail();
    // template() builds exactly one delete-details request
    // (WorkflowJobTemplateNodesAPI.read); opening the delete modal fires it once.
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(WorkflowJobTemplateNodesAPI.read).toHaveBeenCalledTimes(1)
    );
  });

  test('link out resource have the correct url', () => {
    renderDetail();
    const inventory = within(getDetailValue('Inventory')).getByRole('link');
    const organization = within(getDetailValue('Organization')).getByRole(
      'link'
    );
    expect(inventory).toHaveAttribute(
      'href',
      '/inventories/inventory/1/details'
    );
    expect(organization).toHaveAttribute('href', '/organizations/1/details');
  });

  test('should not load Activity', () => {
    renderDetail({
      ...template,
      summary_fields: {
        ...template.summary_fields,
        recent_jobs: [],
      },
    });
    // isEmpty Activity detail renders nothing
    expect(screen.queryByText('Activity')).not.toBeInTheDocument();
  });

  test('should not load Labels', () => {
    renderDetail({
      ...template,
      summary_fields: {
        ...template.summary_fields,
        labels: {
          results: [],
        },
      },
    });
    // isEmpty Labels detail renders nothing
    expect(screen.queryByText('Labels')).not.toBeInTheDocument();
  });
});
