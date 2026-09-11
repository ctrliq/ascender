import type { Notification } from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class Notifications extends Base<Notification> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/notifications/';
  }
}

export default Notifications;
