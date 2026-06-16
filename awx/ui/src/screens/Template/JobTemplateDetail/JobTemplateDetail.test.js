import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { JobTemplatesAPI, WorkflowJobTemplateNodesAPI, RootAPI } from 'api';
import {
  renderWithContexts,
  assertDetail,
} from '../../../../testUtils/rtlContexts';
import JobTemplateDetail from './JobTemplateDetail';
import mockTemplate from '../shared/data.job_template.json';

jest.mock('../../../api');

const mockInstanceGroups = {
  count: 5,
  data: {
    results: [
      { id: 1, name: 'IG1' },
      { id: 2, name: 'IG2' },
    ],
  },
};

// Detail renders <dd data-cy="<dataCy>-value">; return the value cell for a
// given Detail dataCy. Labels carry a help-button child, so matching on the
// stable data-cy is more reliable than getByText on the label.
function getDetailValueByCy(dataCy) {
  return document.querySelector(`[data-cy="${dataCy}-value"]`);
}

describe('<JobTemplateDetail />', () => {
  beforeEach(() => {
    JobTemplatesAPI.readInstanceGroups.mockResolvedValue(mockInstanceGroups);
    WorkflowJobTemplateNodesAPI.read.mockResolvedValue({ data: { count: 0 } });
    RootAPI.readAssetVariables.mockResolvedValue({
      data: {
        BRAND_NAME: 'AWX',
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const renderDefault = async () => {
    const result = renderWithContexts(
      <JobTemplateDetail template={mockTemplate} />
    );
    await waitFor(() => expect(screen.getByText('Name')).toBeInTheDocument());
    return result;
  };

  test('should render successfully with missing summary fields', async () => {
    renderWithContexts(
      <JobTemplateDetail
        template={{
          ...mockTemplate,
          become_enabled: true,
          summary_fields: { user_capabilities: {} },
        }}
      />
    );
    expect(await screen.findByText('Name')).toBeInTheDocument();
  });

  test('should have proper number of delete detail requests', async () => {
    const { user } = renderWithContexts(
      <JobTemplateDetail
        template={{
          ...mockTemplate,
          become_enabled: true,
          summary_fields: { user_capabilities: { delete: true } },
        }}
      />
    );
    await waitFor(() => expect(screen.getByText('Name')).toBeInTheDocument());
    // template() builds exactly one delete-details request
    // (WorkflowJobTemplateNodesAPI.read); opening the delete modal fires it once.
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(WorkflowJobTemplateNodesAPI.read).toHaveBeenCalledTimes(1)
    );
  });

  test('should request instance groups from api', async () => {
    await renderDefault();
    expect(JobTemplatesAPI.readInstanceGroups).toHaveBeenCalledTimes(1);
  });

  test('should hide edit button for users without edit permission', async () => {
    renderWithContexts(
      <JobTemplateDetail
        template={{
          ...mockTemplate,
          diff_mode: true,
          host_config_key: 'key',
          summary_fields: { user_capabilities: { edit: false } },
        }}
      />
    );
    await waitFor(() => expect(screen.getByText('Name')).toBeInTheDocument());
    expect(
      screen.queryByRole('link', { name: 'Edit' })
    ).not.toBeInTheDocument();
  });

  test('should render credential chips', async () => {
    await renderDefault();
    mockTemplate.summary_fields.credentials.forEach((credential) => {
      expect(screen.getByText(credential.name)).toBeInTheDocument();
    });
  });

  test('should render Source Control Branch', async () => {
    await renderDefault();
    assertDetail('Source Control Branch', 'Foo branch');
  });

  test('should render instance groups link', async () => {
    await renderDefault();
    const instanceGroups = getDetailValueByCy('jt-detail-instance-groups');
    expect(
      within(instanceGroups).getByRole('link', { name: 'IG2' })
    ).toHaveAttribute('href', '/instance_groups/2/details');
  });

  test('should show content error for failed instance group fetch', async () => {
    JobTemplatesAPI.readInstanceGroups.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    renderWithContexts(
      <JobTemplateDetail
        template={{
          ...mockTemplate,
          allow_simultaneous: true,
          ask_inventory_on_launch: true,
          summary_fields: {
            inventory: {
              kind: 'smart',
            },
          },
        }}
      />
    );
    expect(
      await screen.findByText(/Something went wrong/i)
    ).toBeInTheDocument();
  });

  test('expected api calls are made for delete', async () => {
    JobTemplatesAPI.destroy.mockResolvedValueOnce({});
    const { user } = await renderDefault();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );
    await waitFor(() =>
      expect(JobTemplatesAPI.destroy).toHaveBeenCalledTimes(1)
    );
  });

  test('Error dialog shown for failed deletion', async () => {
    JobTemplatesAPI.destroy.mockImplementationOnce(() =>
      Promise.reject(new Error())
    );
    const { user } = await renderDefault();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Delete' })
    );
    expect(await screen.findByText('Error!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByText('Error!')).not.toBeInTheDocument()
    );
  });

  test('webhook fields should render properly', async () => {
    await renderDefault();
    assertDetail('Webhook Service', 'GitHub');
    expect(getDetailValueByCy('jt-detail-webhook-url')).toHaveTextContent(
      'api/v2/job_templates/7/github/'
    );
    expect(getDetailValueByCy('jt-detail-webhook-key')).toBeInTheDocument();
    expect(
      getDetailValueByCy('jt-detail-webhook-credential')
    ).toBeInTheDocument();
  });

  test('execution environment field should render properly', async () => {
    await renderDefault();
    assertDetail('Execution Environment', 'Default EE');
  });

  test('should not load credentials', async () => {
    renderWithContexts(
      <JobTemplateDetail
        template={{
          ...mockTemplate,
          allow_simultaneous: true,
          ask_inventory_on_launch: true,
          summary_fields: {
            credentials: [],
          },
        }}
      />
    );
    await waitFor(() => expect(screen.getByText('Name')).toBeInTheDocument());
    // an isEmpty Detail renders nothing, so the Credentials row is absent
    expect(getDetailValueByCy('jt-detail-credentials')).toBeNull();
  });

  test('should not load labels', async () => {
    renderWithContexts(
      <JobTemplateDetail
        template={{
          ...mockTemplate,
          allow_simultaneous: true,
          ask_inventory_on_launch: true,
          summary_fields: {
            labels: {
              results: [],
            },
          },
        }}
      />
    );
    await waitFor(() => expect(screen.getByText('Name')).toBeInTheDocument());
    // an isEmpty Detail renders nothing, so the Labels row is absent
    expect(getDetailValueByCy('jt-detail-labels')).toBeNull();
  });

  test('should not load instance groups', async () => {
    JobTemplatesAPI.readInstanceGroups.mockResolvedValue({
      data: {
        results: [],
      },
    });
    await renderDefault();
    // an isEmpty Detail renders nothing, so the Instance Groups row is absent
    expect(getDetailValueByCy('jt-detail-instance-groups')).toBeNull();
  });

  test('should not load job tags', async () => {
    renderWithContexts(
      <JobTemplateDetail
        template={{
          ...mockTemplate,
          job_tags: '',
        }}
      />
    );
    await waitFor(() => expect(screen.getByText('Name')).toBeInTheDocument());
    expect(screen.queryByText('Job Tags')).not.toBeInTheDocument();
  });

  test('should not load skip tags', async () => {
    renderWithContexts(
      <JobTemplateDetail
        template={{
          ...mockTemplate,
          skip_tags: '',
        }}
      />
    );
    await waitFor(() => expect(screen.getByText('Name')).toBeInTheDocument());
    expect(screen.queryByText('Skip Tags')).not.toBeInTheDocument();
  });
});
