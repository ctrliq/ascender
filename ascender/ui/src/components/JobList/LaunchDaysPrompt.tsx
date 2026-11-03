import React, { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import {
  Button,
  HelperText,
  HelperTextItem,
  TextInput,
} from '@patternfly/react-core';
import AlertModal from 'components/AlertModal';

/** What the api accepts, and what the cleanup job list has always allowed. */
export const MAX_RETENTION = 99999;

/** The cleanup jobs that ask how much history to keep before they run. */
const PROMPTS_FOR_DAYS = ['cleanup_activitystream', 'cleanup_jobs'];

/**
 * Whether a cleanup job is one of those.
 *
 * Next to the prompt itself, since every screen that runs one of these jobs
 * asks the same question of it: the row on the cleanup jobs list, the button
 * above that list, and the run menu on the runs screen.
 */
export const keepsHistory = (managementJob: Record<string, unknown>): boolean =>
  PROMPTS_FOR_DAYS.includes(String(managementJob.job_type ?? ''));

/**
 * The number of days typed, or null when it is not one the api takes: a whole
 * number from 0 up to the maximum. An empty field is not read as 0, which
 * would have deleted every record the job covers.
 */
export const parseDays = (value: string): number | null => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const days = Number(trimmed);
  return days <= MAX_RETENTION ? days : null;
};

export interface LaunchDaysPromptProps {
  onClose: () => void;
  onConfirm: (days: number) => void;
  /** How many days of records the job keeps, seeding the input. */
  defaultDays?: number;
  /** How many cleanup jobs the answer goes to, which the title counts. */
  jobCount?: number;
}

/**
 * How much history a cleanup job keeps, asked before it runs.
 *
 * Two of the cleanup jobs take this and nothing else. Every place that runs
 * one asks with this prompt: the rocket on a row of the cleanup jobs list, the
 * Run above that list, the job's own details and runs tab, and the run menu.
 */
function LaunchDaysPrompt({
  onClose,
  onConfirm,
  defaultDays = 30,
  jobCount = 1,
}: LaunchDaysPromptProps) {
  const { t } = useLingui();
  const [value, setValue] = useState(String(defaultDays));
  const days = parseDays(value);
  const title = jobCount > 1 ? t`Run Cleanup Jobs` : t`Run Cleanup Job`;

  return (
    <AlertModal
      isOpen
      variant="info"
      onClose={onClose}
      title={title}
      label={title}
      actions={[
        <Button
          key="launch"
          ouiaId="launch-days-confirm-button"
          variant="primary"
          isDisabled={days === null}
          onClick={() => {
            if (days !== null) onConfirm(days);
          }}
        >
          {t`Run`}
        </Button>,
        <Button
          key="cancel"
          ouiaId="launch-days-cancel-button"
          variant="link"
          onClick={onClose}
        >
          {t`Cancel`}
        </Button>,
      ]}
    >
      <div>{t`Set how many days of data should be retained.`}</div>
      <TextInput
        aria-label={t`Days of Data to Keep`}
        id="launch-days"
        type="number"
        min="0"
        max={MAX_RETENTION}
        value={value}
        validated={days === null ? 'error' : 'default'}
        aria-describedby={days === null ? 'launch-days-helper' : undefined}
        onChange={(_event, next) => setValue(next)}
      />
      {days === null && (
        <HelperText id="launch-days-helper">
          <HelperTextItem variant="error">
            {t`Enter a whole number of days from 0 to ${MAX_RETENTION}.`}
          </HelperTextItem>
        </HelperText>
      )}
    </AlertModal>
  );
}

export default LaunchDaysPrompt;
