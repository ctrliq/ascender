import Base from '../Base';
import RunnableMixin from '../mixins/Runnable.mixin';

class ExecutionEnvironmentBuilderBuilds extends RunnableMixin(Base) {
  constructor(http) {
    super(http);
    this.baseUrl = 'api/v2/builds/';
  }

  readStdout(id) {
    return this.http.get(`${this.baseUrl}${id}/stdout/`);
  }
}

export default ExecutionEnvironmentBuilderBuilds;
