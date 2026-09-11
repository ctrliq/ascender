import type { AnyUnifiedJobTemplate } from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class UnifiedJobTemplates extends Base<AnyUnifiedJobTemplate> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/unified_job_templates/';
  }
}

export default UnifiedJobTemplates;
