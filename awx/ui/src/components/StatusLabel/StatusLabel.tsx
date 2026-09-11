import type { Untyped } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Label, Tooltip } from '@patternfly/react-core';
import type { LabelProps } from '@patternfly/react-core';
import icons from '../StatusIcon/icons';

const colors = {
  approved: 'green',
  denied: 'red',
  success: 'green',
  successful: 'green',
  ok: 'green',
  healthy: 'green',
  failed: 'red',
  error: 'red',
  unreachable: 'red',
  running: 'blue',
  pending: 'blue',
  skipped: 'blue',
  timedOut: 'red',
  waiting: 'grey',
  disabled: 'grey',
  canceled: 'orange',
  changed: 'orange',
  /* Instance statuses */
  ready: 'green',
  installed: 'blue',
  provisioning: 'gray',
  deprovisioning: 'gray',
  unavailable: 'red',
  'provision-fail': 'red',
  'deprovision-fail': 'red',
};

export interface StatusLabelProps {
  /** The job status, which keys the colour and label maps below. */
  status?: string;
  tooltipContent?: Untyped;
  children?: React.ReactNode;
  [key: string]: unknown;
}

export default function StatusLabel({
  status,
  tooltipContent = '',
  children,
}: StatusLabelProps) {
  const { t } = useLingui();
  const upperCaseStatus = {
    approved: t`Approved`,
    denied: t`Denied`,
    success: t`Success`,
    healthy: t`Healthy`,
    successful: t`Successful`,
    ok: t`OK`,
    failed: t`Failed`,
    error: t`Error`,
    unreachable: t`Unreachable`,
    running: t`Running`,
    pending: t`Pending`,
    skipped: t`Skipped`,
    timedOut: t`Timed out`,
    waiting: t`Waiting`,
    disabled: t`Disabled`,
    canceled: t`Canceled`,
    changed: t`Changed`,
    /* Instance statuses */
    ready: t`Ready`,
    installed: t`Installed`,
    provisioning: t`Provisioning`,
    deprovisioning: t`Deprovisioning`,
    unavailable: t`Unavailable`,
    'provision-fail': t`Provisioning fail`,
    'deprovision-fail': t`Deprovisioning fail`,
  };
  const label =
    upperCaseStatus[status as keyof typeof upperCaseStatus] || status;
  const color = colors[status as keyof typeof colors] || 'grey';
  const Icon = icons[status as keyof typeof icons];

  const renderLabel = () => (
    <Label
      variant="filled"
      color={color as LabelProps['color']}
      icon={Icon ? <Icon /> : null}
      className="ascender-status-label"
    >
      {children || label}
    </Label>
  );

  return (
    <>
      {tooltipContent ? (
        <Tooltip content={tooltipContent} position="top">
          {renderLabel()}
        </Tooltip>
      ) : (
        renderLabel()
      )}
    </>
  );
}
