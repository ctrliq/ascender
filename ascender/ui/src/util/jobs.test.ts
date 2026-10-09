import {
  canForceRelaunchNodeSuccess,
  canOfferCancel,
  getJobModel,
  isJobRunning,
} from './jobs';

describe('canForceRelaunchNodeSuccess', () => {
  test('follows the template as it is now, not the copy the run took', () => {
    expect(
      canForceRelaunchNodeSuccess({
        allow_force_node_success_on_relaunch: false,
        summary_fields: {
          workflow_job_template: { allow_force_node_success_on_relaunch: true },
        },
      })
    ).toBe(true);
    expect(
      canForceRelaunchNodeSuccess({
        allow_force_node_success_on_relaunch: true,
        summary_fields: {
          workflow_job_template: {
            allow_force_node_success_on_relaunch: false,
          },
        },
      })
    ).toBe(false);
  });

  test('falls back on the run once the template is gone', () => {
    expect(
      canForceRelaunchNodeSuccess({
        allow_force_node_success_on_relaunch: true,
        summary_fields: {},
      })
    ).toBe(true);
    expect(canForceRelaunchNodeSuccess({ type: 'job' })).toBe(false);
    expect(canForceRelaunchNodeSuccess(null)).toBe(false);
  });
});

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

describe('canOfferCancel', () => {
  test('follows the start capability', () => {
    expect(
      canOfferCancel({ summary_fields: { user_capabilities: { start: true } } })
    ).toBe(true);
    expect(
      canOfferCancel({
        summary_fields: { user_capabilities: { start: false } },
      })
    ).toBe(false);
    expect(canOfferCancel({})).toBe(false);
  });
  test('is offered when relaunch prevention took the start capability away', () => {
    expect(
      canOfferCancel({
        summary_fields: {
          user_capabilities: { start: false },
          job_template: { prevent_relaunch: true },
        },
      })
    ).toBe(true);
  });
});
