import type { QSParams } from 'util/qs';
import type { JobStatus, Paginated, UnifiedJob } from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

export interface StackCancelResponse {
  canceled: number;
  skipped: number;
  skipped_ids: number[];
  remaining: number;
  /** Lowest id examined by this request, or null when nothing remains. */
  next_before_id: number | null;
}

export interface StatusSummaryResponse {
  counts: Partial<Record<JobStatus, number>>;
}

class UnifiedJobs extends Base<UnifiedJob> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/unified_jobs/';
  }

  cancelStack(params: QSParams, templateId: number, beforeId?: number) {
    return this.http.post<StackCancelResponse>(
      `${this.baseUrl}stacks/cancel/`,
      {
        unified_job_template: templateId,
        ...(beforeId === undefined ? {} : { before_id: beforeId }),
      },
      { params }
    );
  }

  readStackSummaries(params: QSParams) {
    return this.http.get<Paginated<UnifiedJob>>(
      `${this.baseUrl}stacks/summary/`,
      { params }
    );
  }

  readStatusSummaries(params: QSParams) {
    return this.http.get<StatusSummaryResponse>(
      `${this.baseUrl}status_summary/`,
      { params }
    );
  }
}

export default UnifiedJobs;
