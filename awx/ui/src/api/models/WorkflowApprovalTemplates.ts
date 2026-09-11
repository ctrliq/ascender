import Base from '../Base';
import type { Http } from '../Base';

class WorkflowApprovalTemplates extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/workflow_approval_templates/';
  }
}

export default WorkflowApprovalTemplates;
