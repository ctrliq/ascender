import Base from '../Base';
import type { Http } from '../Base';

class ActivityStream extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/activity_stream/';
  }
}

export default ActivityStream;
