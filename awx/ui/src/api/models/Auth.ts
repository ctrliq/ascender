import Base from '../Base';
import type { Http } from '../Base';

class Auth extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/auth/';
  }
}

export default Auth;
