import Base from '../Base';
import type { Http } from '../Base';

class Config extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/config/';
    this.read = this.read.bind(this);
  }

  readSubscriptions(username: unknown, password: unknown) {
    return this.http.post(`${this.baseUrl}subscriptions/`, {
      subscriptions_username: username,
      subscriptions_password: password,
    });
  }

  attach(data: unknown) {
    return this.http.post(`${this.baseUrl}attach/`, data);
  }
}

export default Config;
