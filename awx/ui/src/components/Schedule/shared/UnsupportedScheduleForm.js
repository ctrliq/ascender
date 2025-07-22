import React from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Button, Form, ActionGroup, Alert } from '@patternfly/react-core';

export default function UnsupportedScheduleForm({ schedule, handleCancel }) {
  const { i18n } = useLingui();
  return (
    <Form autoComplete="off">
      <Alert
        variant="danger"
        isInline
        ouiaId="form-submit-error-alert"
        title={i18n._(
          msg`This schedule uses complex rules that are not supported in the\n  UI.  Please use the API to manage this schedule.`
        )}
      />
      <b>{i18n._(msg`Schedule Rules`)}:</b>
      <pre css="white-space: pre; font-family: var(--pf-global--FontFamily--monospace)">
        {schedule.rrule.split(' ').join('\n')}
      </pre>
      <ActionGroup>
        <Button
          ouiaId="schedule-form-cancel-button"
          aria-label={i18n._(msg`Cancel`)}
          variant="secondary"
          type="button"
          onClick={handleCancel}
        >
          {i18n._(msg`Cancel`)}
        </Button>
      </ActionGroup>
    </Form>
  );
}
