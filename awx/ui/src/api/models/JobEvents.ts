import type { QSParams } from 'util/qs';
import Base from '../Base';
import type { Http } from '../Base';

class JobEvents extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/job_events/';
  }

  readChildren(id: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${id}/children/`, { params });
  }
}

export default JobEvents;
