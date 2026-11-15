import { useLingui } from '@lingui/react/macro';

import type { UnifiedJob } from 'types/api';

/** The labels the Jobs table uses for each unified job type. */
export default function useJobTypeLabels(jobType?: UnifiedJob['job_type']) {
  const { t } = useLingui();
  return {
    project_update: t`Source Control Update`,
    inventory_update: t`Inventory Sync`,
    job: jobType === 'check' ? t`Playbook Check` : t`Playbook Run`,
    ad_hoc_command: t`Command`,
    system_job: t`Management Job`,
    workflow_job: t`Workflow Job`,
  };
}
