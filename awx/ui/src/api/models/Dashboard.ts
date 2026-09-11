import type { QSParams } from 'util/qs';
import Base from '../Base';
import type { Http } from '../Base';

class Dashboard extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/dashboard/';
  }

  readJobGraph(params?: QSParams) {
    return this.http.get(`${this.baseUrl}graphs/jobs/`, {
      params,
    });
  }
}

export default Dashboard;
