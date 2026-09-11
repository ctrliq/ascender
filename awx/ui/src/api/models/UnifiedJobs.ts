import Base from '../Base';
import type { Http } from '../Base';

class UnifiedJobs extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/unified_jobs/';
  }
}

export default UnifiedJobs;
