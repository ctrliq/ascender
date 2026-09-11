import Base from '../Base';
import type { Http } from '../Base';

class Notifications extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/notifications/';
  }
}

export default Notifications;
