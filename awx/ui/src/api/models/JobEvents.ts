import type { QSParams } from 'util/qs';
import type { JobEventRecord, Paginated } from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class JobEvents extends Base<JobEventRecord> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/job_events/';
  }

  readChildren(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<JobEventRecord>>(
      `${this.baseUrl}${id}/children/`,
      { params }
    );
  }
}

export default JobEvents;
