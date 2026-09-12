import Base from '../Base';
import type { Http } from '../Base';

/**
 * One subscription the account holds, as the subscriptions endpoint lists it.
 *
 * The list is keyed by pool, and two entries can share a pool id, so the
 * screen numbers them itself before it puts them in a table.
 */
export interface SubscriptionPool {
  id?: number;
  pool_id?: string;
  subscription_name?: string;
  instance_count?: number;
  license_date?: number;
  trial?: boolean;
  [key: string]: unknown;
}

/** What /api/v2/config/ reports about the install and its subscription. */
export interface ConfigResponse {
  version?: string;
  eula?: string;
  license_info?: Record<string, unknown>;
  analytics_status?: string;
  ansible_version?: string;
  project_base_dir?: string;
  project_local_paths?: string[];
  custom_virtualenvs?: string[];
  time_zone?: string;
  become_method_choices?: [string, string][];
  [key: string]: unknown;
}

class Config extends Base<ConfigResponse> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/config/';
    this.read = this.read.bind(this);
  }

  // The config answers with one object rather than a page of them.
  read<T = ConfigResponse>() {
    return this.http.get<T>(this.baseUrl);
  }

  readSubscriptions(username: unknown, password: unknown) {
    return this.http.post<SubscriptionPool[]>(`${this.baseUrl}subscriptions/`, {
      subscriptions_username: username,
      subscriptions_password: password,
    });
  }

  attach(data: unknown) {
    return this.http.post(`${this.baseUrl}attach/`, data);
  }
}

export default Config;
