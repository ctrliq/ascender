import {
  canCancelJob,
  canDeleteJob,
  getJobModel,
  getRunActionLabels,
  isJobCancelable,
  isJobDeletable,
  isJobRunning,
} from './jobs';

describe('isJobRunning', () => {
  test('should return true for new', () => {
    expect(isJobRunning('new')).toBe(true);
  });
  test('should return true for pending', () => {
    expect(isJobRunning('pending')).toBe(true);
  });
  test('should return true for waiting', () => {
    expect(isJobRunning('waiting')).toBe(true);
  });
  test('should return true for running', () => {
    expect(isJobRunning('running')).toBe(true);
  });
  test('should return false for canceled', () => {
    expect(isJobRunning('canceled')).toBe(false);
  });
  test('should return false for successful', () => {
    expect(isJobRunning('successful')).toBe(false);
  });
  test('should return false for failed', () => {
    expect(isJobRunning('failed')).toBe(false);
  });
});

describe('getJobModel', () => {
  test('should return valid job model in all cases', () => {
    const baseUrls: string[] = [];
    [
      'ad_hoc_command',
      'inventory_update',
      'project_update',
      'system_job',
      'workflow_job',
      'job',
      'default',
    ].forEach((type) => {
      expect(getJobModel(type)).toHaveProperty('http');
      expect(getJobModel(type).jobEventSlug).toBeDefined();
      baseUrls.push(getJobModel(type).baseUrl);
    });
    expect(new Set(baseUrls).size).toBe(baseUrls.length - 1);
  });
});

/* The same list under a second name, so the two cannot drift apart. */
test('isJobCancelable is isJobRunning', () => {
  expect(isJobCancelable).toBe(isJobRunning);
});

describe('isJobCancelable and isJobDeletable', () => {
  test.each([
    ['new', true, true],
    ['pending', true, false],
    ['waiting', true, false],
    ['running', true, false],
    ['successful', false, true],
    ['failed', false, true],
    ['error', false, true],
    ['canceled', false, true],
  ])('%s: cancelable %s, deletable %s', (status, cancelable, deletable) => {
    expect(isJobCancelable(status)).toBe(cancelable);
    expect(isJobDeletable(status)).toBe(deletable);
  });
});

describe('canCancelJob and canDeleteJob', () => {
  const run = (status: string, caps: Record<string, boolean>) => ({
    status,
    summary_fields: { user_capabilities: caps },
  });

  test('cancel needs the capability and a status that can stop', () => {
    expect(canCancelJob(run('running', { cancel: true }))).toBe(true);
    expect(canCancelJob(run('new', { cancel: true }))).toBe(true);
    expect(canCancelJob(run('running', { start: true }))).toBe(false);
    expect(canCancelJob(run('successful', { cancel: true }))).toBe(false);
  });

  test('delete needs the capability and a status the api allows', () => {
    expect(canDeleteJob(run('new', { delete: true }))).toBe(true);
    expect(canDeleteJob(run('failed', { delete: true }))).toBe(true);
    expect(canDeleteJob(run('running', { delete: true }))).toBe(false);
    expect(canDeleteJob(run('failed', {}))).toBe(false);
  });
});

describe('getRunActionLabels', () => {
  test('names the kind of run', () => {
    expect(getRunActionLabels('workflow_job').relaunch.message).toBe(
      'Relaunch Workflow Job'
    );
    expect(getRunActionLabels('system_job').delete.message).toBe(
      'Delete Cleanup Job'
    );
    expect(getRunActionLabels(undefined).delete.message).toBe('Delete Job');
  });

  test('names the kind of run it cancels', () => {
    const labels = getRunActionLabels('project_update');
    expect(labels.cancel.message).toBe('Cancel Project Sync');
    expect(labels.cancelConfirm.message).toBe(
      'Are you sure you want to cancel this project sync?'
    );
    expect(labels.cancelError.message).toBe('Project Sync Cancel Error');
    expect(getRunActionLabels(undefined).cancel.message).toBe('Cancel Job');
  });
});
