import type { ApiEntity, Paginated } from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class CredentialTypes extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/credential_types/';
  }

  async loadAllTypes(
    acceptableKinds: string[] = [
      'machine',
      'cloud',
      'net',
      'ssh',
      'vault',
      'kubernetes',
      'cryptography',
    ]
  ) {
    const pageSize = 200;
    // The number of credential types a user can have is unlimited. In practice, it is unlikely for
    // users to have more than a page at the maximum request size.
    const {
      data: { next, results },
    } = await this.read<Paginated<ApiEntity>>({ page_size: pageSize });
    let nextResults: ApiEntity[] = [];
    if (next) {
      const { data } = await this.read<Paginated<ApiEntity>>({
        page_size: pageSize,
        page: 2,
      });
      nextResults = data.results;
    }
    return results
      .concat(nextResults)
      .filter((type: ApiEntity) => acceptableKinds.includes(type.kind as string));
  }

  test(id: number | string, data: unknown) {
    return this.http.post(`${this.baseUrl}${id}/test/`, data);
  }
}

export default CredentialTypes;
