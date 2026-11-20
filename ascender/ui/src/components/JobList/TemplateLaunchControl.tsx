import type { LaunchableResource } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Button } from '@patternfly/react-core';
import { LaunchButton } from 'components/LaunchButton';
import Tooltip from 'components/Tooltip';

export interface TemplateLaunchControlProps {
  template: LaunchableResource & {
    id: number;
    summary_fields?: { user_capabilities?: { start?: boolean } };
  };
}

/**
 * Run for one template on its runs tab: the same launch, prompts and all, as
 * the Launch at the foot of the template's details, shown to whoever that one
 * is shown to. It says Run, as every runs tab's button does, and its tooltip
 * says what running means here.
 */
function TemplateLaunchControl({ template }: TemplateLaunchControlProps) {
  const { t } = useLingui();
  if (!template.summary_fields?.user_capabilities?.start) {
    return null;
  }
  return (
    <LaunchButton resource={template} aria-label={t`Run`}>
      {({ handleLaunch, isLaunching }) => (
        <Tooltip
          content={
            template.type === 'workflow_job_template'
              ? t`Run Workflow Template`
              : t`Run Job Template`
          }
          position="top"
        >
          <Button
            ouiaId="runs-tab-run-button"
            variant="secondary"
            aria-label={t`Run`}
            onClick={handleLaunch}
            isDisabled={isLaunching}
          >
            {t`Run`}
          </Button>
        </Tooltip>
      )}
    </LaunchButton>
  );
}

export default TemplateLaunchControl;
