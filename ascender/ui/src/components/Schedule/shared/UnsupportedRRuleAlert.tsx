import type { Schedule } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Alert } from '@patternfly/react-core';
import './UnsupportedRRuleAlert.css';

export interface UnsupportedRRuleAlertProps {
  schedule: Schedule;
  [key: string]: unknown;
}

export default function UnsupportedRRuleAlert({
  schedule,
}: UnsupportedRRuleAlertProps) {
  const { t } = useLingui();
  return (
    <div className="ascender-unsupported-r-rule-alert__wrapper">
      <Alert
        isInline
        variant="danger"
        ouiaId="schedule-warning"
        title={t`This schedule uses complex rules that are not supported in the\n        UI.  Please use the API to manage this schedule.`}
      />
      <p className="ascender-unsupported-r-rule-alert__rules-title">
        {t`Schedule Rules`}:
      </p>
      <pre style={{ fontFamily: 'var(--pf-t--global--font--family--mono)' }}>
        {schedule.rrule?.split(' ').join('\n')}
      </pre>
    </div>
  );
}
