import type { Label } from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class Labels extends Base<Label> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/labels/';
  }
}

export default Labels;
