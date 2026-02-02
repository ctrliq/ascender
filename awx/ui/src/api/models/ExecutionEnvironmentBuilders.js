import Base from '../Base';

class ExecutionEnvironmentBuilders extends Base {
  constructor(http) {
    super(http);
    this.baseUrl = 'api/v2/execution_environment_builders/';

    this.readAccessList = this.readAccessList.bind(this);
    this.readAccessOptions = this.readAccessOptions.bind(this);
    this.copy = this.copy.bind(this);
    this.launch = this.launch.bind(this);
  }

  readAccessList(id, params) {
    return this.http.get(`${this.baseUrl}${id}/access_list/`, { params });
  }

  readAccessOptions(id) {
    return this.http.options(`${this.baseUrl}${id}/access_list/`);
  }

  copy(id, data) {
    return this.http.post(`${this.baseUrl}${id}/copy/`, data);
  }

  launch(id, data) {
    return this.http.post(`${this.baseUrl}${id}/launch/`, data);
  }
}

export default ExecutionEnvironmentBuilders;
