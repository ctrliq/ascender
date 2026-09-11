import type { Untyped } from 'types/api';
import {
  InventorySourcesAPI,
  JobTemplatesAPI,
  ProjectsAPI,
  SystemJobTemplatesAPI,
  WorkflowJobTemplatesAPI,
} from 'api';
import type { WorkflowNode } from '../../../../components/Workflow/workflowReducer';

// A tuple rather than an array, so a caller destructuring it gets the name
// and the model rather than a union of the two.
export default function getNodeType(
  node: WorkflowNode
): [string | null, Untyped] {
  const ujtType = node?.type || node?.unified_job_type;
  switch (ujtType) {
    case 'job_template':
    case 'job':
      return ['job_template', JobTemplatesAPI];
    case 'project':
    case 'project_update':
      return ['project_sync', ProjectsAPI];
    case 'inventory_source':
    case 'inventory_update':
      return ['inventory_source_sync', InventorySourcesAPI];
    case 'workflow_job_template':
    case 'workflow_job':
      return ['workflow_job_template', WorkflowJobTemplatesAPI];
    case 'workflow_approval_template':
    case 'workflow_approval':
      return ['approval', null];
    case 'system_job_template':
    case 'system_job':
      return ['system_job_template', SystemJobTemplatesAPI];
    default:
      return [null, null];
  }
}
