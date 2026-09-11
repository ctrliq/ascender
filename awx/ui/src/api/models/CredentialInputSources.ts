import Base from '../Base';
import type { Http } from '../Base';

class CredentialInputSources extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/credential_input_sources/';
  }
}

export default CredentialInputSources;
