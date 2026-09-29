import { SystemJobTemplatesAPI } from 'api';
import type { ResponseOf } from '../../../testUtils/responseOf';
import launchCleanupJob, { launchRefusalReason } from './launchCleanupJob';

vi.mock('../../api/models/SystemJobTemplates');

describe('launchCleanupJob', () => {
  beforeEach(() => {
    vi.mocked(SystemJobTemplatesAPI.launch).mockResolvedValue({
      data: { id: 80 },
    } as unknown as ResponseOf<typeof SystemJobTemplatesAPI.launch>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('sends the days to a job that keeps history, and returns the run', async () => {
    await expect(
      launchCleanupJob({ id: 1, job_type: 'cleanup_activitystream' }, 7)
    ).resolves.toBe(80);
    expect(SystemJobTemplatesAPI.launch).toHaveBeenCalledWith(1, {
      extra_vars: { days: 7 },
    });
  });

  test('sends nothing to a job that keeps nothing, whatever days it is given', async () => {
    await launchCleanupJob({ id: 3, job_type: 'cleanup_sessions' }, 7);
    expect(SystemJobTemplatesAPI.launch).toHaveBeenCalledWith(3, {});
  });

  test('sends nothing where no days were asked for', async () => {
    await launchCleanupJob({ id: 1, job_type: 'cleanup_activitystream' });
    expect(SystemJobTemplatesAPI.launch).toHaveBeenCalledWith(1, {});
  });
});

describe('launchRefusalReason', () => {
  test("reads the api's detail", () => {
    expect(
      launchRefusalReason({ response: { data: { detail: 'Busy.' } } })
    ).toBe('Busy.');
  });

  test('joins field errors into one line', () => {
    expect(
      launchRefusalReason({
        response: { data: { extra_vars: ['Bad days.'], other: ['More.'] } },
      })
    ).toBe('Bad days. More.');
  });

  test("falls back to the error's own message", () => {
    expect(launchRefusalReason(new Error('Network Error'))).toBe(
      'Network Error'
    );
  });
});
