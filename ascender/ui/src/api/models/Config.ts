import Base from '../Base';
import type { Http } from '../Base';

/** What /api/v2/config/ reports about the install. */
export interface ConfigResponse {
  version?: string;
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
}

export default Config;
