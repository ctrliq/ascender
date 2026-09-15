import type { User } from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class Me extends Base<User> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/me/';
  }
}

export default Me;
