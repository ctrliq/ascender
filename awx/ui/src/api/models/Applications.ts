import type { QSParams } from 'util/qs';
import Base from '../Base';
import type { Http } from '../Base';

class Applications extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/applications/';
  }

  readTokens(appId: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${appId}/tokens/`, {
      params,
    });
  }

  readTokenOptions(appId: number | string) {
    return this.http.options(`${this.baseUrl}${appId}/tokens/`);
  }
}

export default Applications;
