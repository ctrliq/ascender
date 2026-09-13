import type { QSParams } from 'util/qs';
import type {
  OAuth2Application,
  OAuth2Token,
  OptionsResponse,
  Paginated,
} from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class Applications extends Base<OAuth2Application> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/applications/';
  }

  readTokens(appId: number | string, params?: QSParams) {
    return this.http.get<Paginated<OAuth2Token>>(
      `${this.baseUrl}${appId}/tokens/`,
      {
        params,
      }
    );
  }

  readTokenOptions(appId: number | string) {
    return this.http.options<OptionsResponse>(
      `${this.baseUrl}${appId}/tokens/`
    );
  }
}

export default Applications;
