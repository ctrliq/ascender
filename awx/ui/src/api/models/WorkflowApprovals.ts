import type {
  Paginated,
  WorkflowApproval,
  WorkflowApprovalVote,
} from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class WorkflowApprovals extends Base<WorkflowApproval> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/workflow_approvals/';
  }

  approve(id: number | string) {
    return this.http.post<void>(`${this.baseUrl}${id}/approve/`);
  }

  deny(id: number | string) {
    return this.http.post<void>(`${this.baseUrl}${id}/deny/`);
  }

  readVotes(id: number | string) {
    return this.http.get<Paginated<WorkflowApprovalVote>>(
      `${this.baseUrl}${id}/votes/`
    );
  }
}

export default WorkflowApprovals;
