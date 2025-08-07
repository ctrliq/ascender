import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Button, Form, ActionGroup, Alert } from '@patternfly/react-core';

export default function UnsupportedScheduleForm({ schedule, handleCancel }) {
  const { t } = useLingui();
  return (
    <Form autoComplete="off">
      <Alert
        variant="danger"
        isInline
        ouiaId="form-submit-error-alert"
        title={t`This schedule uses complex rules that are not supported in the\n  UI.  Please use the API to manage this schedule.`}
      />
      <b>{t`Schedule Rules`}:</b>
      <pre css="white-space: pre; font-family: var(--pf-global--FontFamily--monospace)">
        {schedule.rrule.split(' ').join('\n')}
      </pre>
      <ActionGroup>
        <Button
          ouiaId="schedule-form-cancel-button"
          aria-label={t`Cancel`}
          variant="secondary"
          type="button"
          onClick={handleCancel}
        >
          {t`Cancel`}
        </Button>
      </ActionGroup>
    </Form>
  );
}
