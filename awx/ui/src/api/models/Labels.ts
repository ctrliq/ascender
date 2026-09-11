import Base from '../Base';
import type { Http } from '../Base';

class Labels extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/labels/';
  }
}

export default Labels;
