import type { OAuth2Token } from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class Tokens extends Base<OAuth2Token> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/tokens/';
  }
}

export default Tokens;
