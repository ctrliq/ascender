import type { NotificationTemplate } from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class NotificationTemplates extends Base<NotificationTemplate> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/notification_templates/';
  }

  // Answers with the id of the notification the test queued.
  test(id: number | string) {
    return this.http.post<{ notification: number }>(
      `${this.baseUrl}${id}/test/`
    );
  }
}

export default NotificationTemplates;
