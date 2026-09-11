import Base from '../Base';
import type { Http } from '../Base';

class NotificationTemplates extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/notification_templates/';
  }

  test(id: number | string) {
    return this.http.post(`${this.baseUrl}${id}/test/`);
  }
}

export default NotificationTemplates;
