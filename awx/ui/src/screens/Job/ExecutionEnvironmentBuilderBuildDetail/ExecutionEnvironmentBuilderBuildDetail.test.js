import React from 'react';
import { act } from 'react-dom/test-utils';
import { createMemoryHistory } from 'history';
import { ExecutionEnvironmentBuilderBuildsAPI } from 'api';
import { mountWithContexts } from '../../../../testUtils/enzymeHelpers';
import ExecutionEnvironmentBuilderBuildDetail from './ExecutionEnvironmentBuilderBuildDetail';

jest.mock('../../../api');

const mockJob = {
  id: 101,
  name: 'Test Builder Build',
  type: 'execution_environment_builder_build',
  url: '/api/v2/builds/101/',
  status: 'successful',
  started: '2024-03-01T12:00:00.000000Z',
  finished: '2024-03-01T12:05:00.000000Z',
  job_explanation: '',
  summary_fields: {
    execution_environment_builder: {
      id: 10,
      name: 'My Builder',
      image: 'quay.io/my-org/my-ee',
      tag: 'latest',
      summary_fields: {
        credential: {
          id: 5,
          name: 'Registry Cred',
          description: '',
          kind: 'registry',
          credential_type_id: 20,
        },
      },
    },
    execution_environment: {
      id: 1,
      name: 'Default EE',
      description: '',
      image: 'quay.io/ansible/awx-ee',
    },
    created_by: {
      id: 1,
      username: 'admin',
    },
    user_capabilities: {
      start: true,
      delete: true,
    },
  },
};

describe('<ExecutionEnvironmentBuilderBuildDetail />', () => {
  let wrapper;

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should display job details', () => {
    wrapper = mountWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={mockJob} />
    );

    const idDetail = wrapper.find('Detail[dataCy="job-id"]');
    expect(idDetail).toHaveLength(1);
    expect(idDetail.prop('value')).toBe(101);

    const statusDetail = wrapper.find('Detail[dataCy="job-status"]');
    expect(statusDetail).toHaveLength(1);
    expect(statusDetail.find('StatusLabel')).toHaveLength(1);

    const startedDetail = wrapper.find('Detail[dataCy="job-started-date"]');
    expect(startedDetail).toHaveLength(1);

    const finishedDetail = wrapper.find('Detail[dataCy="job-finished-date"]');
    expect(finishedDetail).toHaveLength(1);

    const nameDetail = wrapper.find(
      'Detail[dataCy="execution-environment-name"]'
    );
    expect(nameDetail).toHaveLength(1);

    const imageDetail = wrapper.find(
      'Detail[dataCy="execution-environment-image"]'
    );
    expect(imageDetail).toHaveLength(1);

    const tagDetail = wrapper.find(
      'Detail[dataCy="execution-environment-tag"]'
    );
    expect(tagDetail).toHaveLength(1);
  });

  test('should not display finished date when job has not finished', () => {
    wrapper = mountWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail
        job={{ ...mockJob, finished: null }}
      />
    );
    expect(
      wrapper.find('Detail[dataCy="job-finished-date"]')
    ).toHaveLength(0);
  });

  test('should display credential chip when credential exists', () => {
    wrapper = mountWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={mockJob} />
    );
    const credentialDetail = wrapper.find(
      'Detail[dataCy="builder-build-credential"]'
    );
    expect(credentialDetail).toHaveLength(1);
    const chip = credentialDetail.find('CredentialChip');
    expect(chip).toHaveLength(1);
    expect(chip.prop('credential')).toEqual(
      mockJob.summary_fields.execution_environment_builder.summary_fields
        .credential
    );
  });

  test('should not display credential when builder has no credential', () => {
    const jobWithoutCred = {
      ...mockJob,
      summary_fields: {
        ...mockJob.summary_fields,
        execution_environment_builder: {
          ...mockJob.summary_fields.execution_environment_builder,
          summary_fields: {},
        },
      },
    };
    wrapper = mountWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={jobWithoutCred} />
    );
    expect(
      wrapper.find('Detail[dataCy="builder-build-credential"]')
    ).toHaveLength(0);
  });

  test('should show Relaunch button when user can start', () => {
    wrapper = mountWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={mockJob} />
    );
    expect(
      wrapper.find('Button[ouiaId="builder-build-detail-relaunch-button"]')
    ).toHaveLength(1);
  });

  test('should hide Relaunch button when user cannot start', () => {
    const jobNoStart = {
      ...mockJob,
      summary_fields: {
        ...mockJob.summary_fields,
        user_capabilities: { start: false, delete: true },
      },
    };
    wrapper = mountWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={jobNoStart} />
    );
    expect(
      wrapper.find('Button[ouiaId="builder-build-detail-relaunch-button"]')
    ).toHaveLength(0);
  });

  test('should show Delete button when job is completed and user can delete', () => {
    wrapper = mountWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={mockJob} />
    );
    expect(
      wrapper.find('DeleteButton[ouiaId="builder-build-detail-delete-button"]')
    ).toHaveLength(1);
  });

  test('should hide Delete button when user cannot delete', () => {
    const jobNoDelete = {
      ...mockJob,
      summary_fields: {
        ...mockJob.summary_fields,
        user_capabilities: { start: true, delete: false },
      },
    };
    wrapper = mountWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={jobNoDelete} />
    );
    expect(
      wrapper.find('DeleteButton[ouiaId="builder-build-detail-delete-button"]')
    ).toHaveLength(0);
  });

  test('should hide Delete button when job is running', () => {
    const runningJob = {
      ...mockJob,
      status: 'running',
    };
    wrapper = mountWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={runningJob} />
    );
    expect(
      wrapper.find('DeleteButton[ouiaId="builder-build-detail-delete-button"]')
    ).toHaveLength(0);
  });

  test('should show Cancel button when job is running and user can start', () => {
    const runningJob = {
      ...mockJob,
      status: 'running',
    };
    wrapper = mountWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={runningJob} />
    );
    expect(wrapper.find('JobCancelButton')).toHaveLength(1);
  });

  test('should hide Cancel button when job is not running', () => {
    wrapper = mountWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={mockJob} />
    );
    expect(wrapper.find('JobCancelButton')).toHaveLength(0);
  });

  test('should hide Cancel button when user cannot start', () => {
    const runningNoStart = {
      ...mockJob,
      status: 'pending',
      summary_fields: {
        ...mockJob.summary_fields,
        user_capabilities: { start: false, delete: true },
      },
    };
    wrapper = mountWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={runningNoStart} />
    );
    expect(wrapper.find('JobCancelButton')).toHaveLength(0);
  });

  test('should call API destroy and navigate to /jobs on successful delete', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/jobs/101/details'],
    });
    ExecutionEnvironmentBuilderBuildsAPI.destroy.mockResolvedValue({});
    wrapper = mountWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={mockJob} />,
      { context: { router: { history } } }
    );

    wrapper.find('button[aria-label="Delete"]').simulate('click');
    wrapper.update();

    const modal = wrapper.find('Modal[aria-label="Alert modal"]');
    expect(modal).toHaveLength(1);

    await act(async () => {
      modal.find('button[aria-label="Confirm Delete"]').simulate('click');
    });
    wrapper.update();

    expect(ExecutionEnvironmentBuilderBuildsAPI.destroy).toHaveBeenCalledWith(
      101
    );
    expect(history.location.pathname).toBe('/jobs');
  });

  test('should display error modal when delete fails', async () => {
    ExecutionEnvironmentBuilderBuildsAPI.destroy.mockRejectedValue(
      new Error('Delete failed')
    );
    wrapper = mountWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={mockJob} />
    );

    wrapper.find('button[aria-label="Delete"]').simulate('click');
    wrapper.update();

    const modal = wrapper.find('Modal[aria-label="Alert modal"]');
    expect(modal).toHaveLength(1);

    await act(async () => {
      modal.find('button[aria-label="Confirm Delete"]').simulate('click');
    });
    wrapper.update();

    expect(wrapper.find('ErrorDetail')).toHaveLength(1);
  });

  test('should display job_explanation in status when provided', () => {
    const jobWithExplanation = {
      ...mockJob,
      status: 'failed',
      job_explanation: 'Build timed out',
    };
    wrapper = mountWithContexts(
      <ExecutionEnvironmentBuilderBuildDetail job={jobWithExplanation} />
    );
    const statusDetail = wrapper.find('Detail[dataCy="job-status"]');
    expect(statusDetail.prop('fullWidth')).toBe(true);
    expect(statusDetail.text()).toContain('Build timed out');
  });
});
