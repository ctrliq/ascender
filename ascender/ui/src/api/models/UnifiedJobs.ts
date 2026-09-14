import type { UnifiedJob } from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class UnifiedJobs extends Base<UnifiedJob> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/unified_jobs/';
  }
}

export default UnifiedJobs;
