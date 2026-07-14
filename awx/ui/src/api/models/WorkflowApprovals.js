import Base from '../Base';

class WorkflowApprovals extends Base {
  constructor(http) {
    super(http);
    this.baseUrl = 'api/v2/workflow_approvals/';
  }

  approve(id) {
    return this.http.post(`${this.baseUrl}${id}/approve/`);
  }

  deny(id) {
    return this.http.post(`${this.baseUrl}${id}/deny/`);
  }

  readVotes(id) {
    return this.http.get(`${this.baseUrl}${id}/votes/`);
  }
}

export default WorkflowApprovals;
