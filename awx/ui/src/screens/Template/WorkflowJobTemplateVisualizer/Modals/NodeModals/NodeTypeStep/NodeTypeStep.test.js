import React from 'react';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { Formik } from 'formik';
import {
  InventorySourcesAPI,
  JobTemplatesAPI,
  ProjectsAPI,
  WorkflowJobTemplatesAPI,
} from 'api';
import { useUserProfile } from 'contexts/Config';
import { renderWithContexts } from '../../../../../../../testUtils/rtlContexts';

import NodeTypeStep from './NodeTypeStep';

jest.mock('../../../../../../api/models/InventorySources');
jest.mock('../../../../../../api/models/JobTemplates');
jest.mock('../../../../../../api/models/Projects');
jest.mock('../../../../../../api/models/WorkflowJobTemplates');

// AnsibleSelect renders <select aria-label="Select Input">.
function getNodeTypeSelect() {
  return screen.getByRole('combobox', { name: 'Select Input' });
}

describe('NodeTypeStep', () => {
  beforeEach(() => {
    useUserProfile.mockImplementation(() => ({
      isSuperUser: true,
      isSystemAuditor: false,
      isOrgAdmin: false,
      isNotificationAdmin: false,
      isExecEnvAdmin: false,
    }));
  });
  // jest is configured with resetMocks:true (package.json), which clears mock
  // implementations before every test. The original enzyme suite set these in
  // beforeAll and only asserted that the right list component mounted (never its
  // rows), so the reset went unnoticed. Here we assert rows render, so the
  // resolved values must be (re)applied in beforeEach to survive the reset.
  beforeEach(() => {
    JobTemplatesAPI.read.mockResolvedValue({
      data: {
        count: 1,
        results: [
          {
            id: 1,
            name: 'Test Job Template',
            type: 'job_template',
            url: '/api/v2/job_templates/1',
          },
        ],
      },
    });
    JobTemplatesAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
    ProjectsAPI.read.mockResolvedValue({
      data: {
        count: 1,
        results: [
          {
            id: 1,
            name: 'Test Project',
            type: 'project',
            url: '/api/v2/projects/1',
          },
        ],
      },
    });
    ProjectsAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
    InventorySourcesAPI.read.mockResolvedValue({
      data: {
        count: 1,
        results: [
          {
            id: 1,
            name: 'Test Inventory Source',
            type: 'inventory_source',
            url: '/api/v2/inventory_sources/1',
          },
        ],
      },
    });
    InventorySourcesAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
    WorkflowJobTemplatesAPI.read.mockResolvedValue({
      data: {
        count: 1,
        results: [
          {
            id: 1,
            name: 'Test Workflow Job Template',
            type: 'workflow_job_template',
            url: '/api/v2/workflow_job_templates/1',
          },
        ],
      },
    });
    WorkflowJobTemplatesAPI.readOptions.mockResolvedValue({
      data: {
        actions: {
          GET: {},
          POST: {},
        },
        related_search_fields: [],
      },
    });
  });
  afterAll(() => {
    jest.clearAllMocks();
  });

  test('It shows the job template list by default', async () => {
    renderWithContexts(
      <Formik initialValues={{ nodeType: 'job_template' }}>
        <NodeTypeStep />
      </Formik>
    );
    expect(getNodeTypeSelect()).toHaveValue('job_template');
    expect(
      await screen.findByRole('row', { name: /Test Job Template/ })
    ).toBeInTheDocument();
  });

  test('It shows the project list when node type is project', async () => {
    renderWithContexts(
      <Formik initialValues={{ nodeType: 'project' }}>
        <NodeTypeStep />
      </Formik>
    );
    expect(getNodeTypeSelect()).toHaveValue('project');
    expect(
      await screen.findByRole('row', { name: /Test Project/ })
    ).toBeInTheDocument();
  });

  test('It shows the inventory source list when node type is inventory source', async () => {
    renderWithContexts(
      <Formik initialValues={{ nodeType: 'inventory_source' }}>
        <NodeTypeStep />
      </Formik>
    );
    expect(getNodeTypeSelect()).toHaveValue('inventory_source');
    expect(
      await screen.findByRole('row', { name: /Test Inventory Source/ })
    ).toBeInTheDocument();
  });

  test('It shows the workflow job template list when node type is workflow job template', async () => {
    renderWithContexts(
      <Formik initialValues={{ nodeType: 'workflow_job_template' }}>
        <NodeTypeStep />
      </Formik>
    );
    expect(getNodeTypeSelect()).toHaveValue('workflow_job_template');
    expect(
      await screen.findByRole('row', { name: /Test Workflow Job Template/ })
    ).toBeInTheDocument();
  });

  test('It shows the approval form fields when node type is approval', async () => {
    renderWithContexts(
      <Formik
        initialValues={{
          nodeType: 'workflow_approval_template',
          approvalName: '',
          approvalDescription: '',
          timeoutMinutes: 0,
          timeoutSeconds: 0,
          convergence: 'any',
        }}
      >
        <NodeTypeStep />
      </Formik>
    );

    expect(getNodeTypeSelect()).toHaveValue('workflow_approval_template');
    const nameInput = document.querySelector('input#approval-name');
    const descriptionInput = document.querySelector('input#approval-description');
    const minutesInput = screen.getByLabelText('Timeout minutes');
    const secondsInput = screen.getByLabelText('Timeout seconds');
    expect(nameInput).toBeInTheDocument();
    expect(descriptionInput).toBeInTheDocument();
    expect(minutesInput).toBeInTheDocument();
    expect(secondsInput).toBeInTheDocument();

    fireEvent.change(nameInput, {
      target: { value: 'Test Approval', name: 'approvalName' },
    });
    fireEvent.change(descriptionInput, {
      target: {
        value: 'Test Approval Description',
        name: 'approvalDescription',
      },
    });
    fireEvent.change(minutesInput, {
      target: { value: 5, name: 'timeoutMinutes' },
    });
    fireEvent.change(secondsInput, {
      target: { value: 30, name: 'timeoutSeconds' },
    });

    await waitFor(() => expect(nameInput).toHaveValue('Test Approval'));
    expect(descriptionInput).toHaveValue('Test Approval Description');
    expect(minutesInput).toHaveValue(5);
    expect(secondsInput).toHaveValue(30);
  });

  test('it does not show management job as a choice for non system admin', async () => {
    useUserProfile.mockImplementation(() => ({
      isSuperUser: false,
      isSystemAuditor: false,
      isOrgAdmin: true,
      isNotificationAdmin: false,
      isExecEnvAdmin: false,
    }));

    renderWithContexts(
      <Formik initialValues={{ nodeType: 'workflow_job_template' }}>
        <NodeTypeStep />
      </Formik>
    );
    await screen.findByRole('row', { name: /Test Workflow Job Template/ });
    const options = within(getNodeTypeSelect()).getAllByRole('option');
    expect(options).toHaveLength(5);
    expect(options.map((opt) => opt.value)).toEqual([
      'workflow_approval_template',
      'inventory_source',
      'job_template',
      'project',
      'workflow_job_template',
    ]);
  });

  test('it does show management job as a choice for system admin', async () => {
    renderWithContexts(
      <Formik initialValues={{ nodeType: 'workflow_job_template' }}>
        <NodeTypeStep />
      </Formik>
    );
    await screen.findByRole('row', { name: /Test Workflow Job Template/ });
    const options = within(getNodeTypeSelect()).getAllByRole('option');
    expect(options).toHaveLength(6);
    expect(options.map((opt) => opt.value)).toEqual([
      'workflow_approval_template',
      'inventory_source',
      'job_template',
      'project',
      'workflow_job_template',
      'system_job_template',
    ]);
  });
});
