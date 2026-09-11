import type { QSParams } from 'util/qs';
import type {
  AccessListEntry,
  ApiEntity,
  Credential,
  OptionsResponse,
  Paginated,
} from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class Credentials extends Base<Credential> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/credentials/';

    this.readAccessList = this.readAccessList.bind(this);
    this.readAccessOptions = this.readAccessOptions.bind(this);
    this.readInputSources = this.readInputSources.bind(this);
  }

  readAccessList(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<AccessListEntry>>(
      `${this.baseUrl}${id}/access_list/`,
      {
        params,
      }
    );
  }

  readAccessOptions(id: number | string) {
    return this.http.options<OptionsResponse>(
      `${this.baseUrl}${id}/access_list/`
    );
  }

  readInputSources(id: number | string) {
    const maxRequests = 5;
    let requestCounter = 0;
    const fetchInputSources = async (
      pageNo = 1,
      inputSources: ApiEntity[] = []
    ) => {
      try {
        requestCounter++;
        const { data } = await this.http.get<Paginated<ApiEntity>>(
          `${this.baseUrl}${id}/input_sources/`,
          {
            params: {
              page: pageNo,
              page_size: 200,
            },
          }
        );
        if (data?.next && requestCounter <= maxRequests) {
          return fetchInputSources(
            pageNo + 1,
            inputSources.concat(data.results)
          );
        }
        return Promise.resolve({
          data: {
            results: inputSources.concat(data.results),
          },
        });
      } catch (error) {
        return Promise.reject(error);
      }
    };

    return fetchInputSources();
  }

  test(id: number | string, data: unknown) {
    return this.http.post(`${this.baseUrl}${id}/test/`, data);
  }
}

export default Credentials;
