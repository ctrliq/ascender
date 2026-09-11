import Base from '../Base';
import type { Http } from '../Base';

class Tokens extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/tokens/';
  }
}

export default Tokens;
