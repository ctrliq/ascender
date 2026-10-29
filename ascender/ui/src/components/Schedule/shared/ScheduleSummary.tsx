import React from 'react';
import { DateTime } from 'luxon';
import { useLingui } from '@lingui/react/macro';
import { useFormContext } from 'components/Form';
import { formatDateString } from 'util/dates';
import { DetailList, Detail } from '../../DetailList';
import type { ScheduleFormValues, ScheduleFrequency } from './types';

/**
 * The schedule as the form holds it, for the preview at the end of the wizard.
 *
 * The preview after it is the launch wizard's own and says what the template
 * will run with; this says when, in the labels the schedule's detail page uses
 * for the same fields, so the two read alike once the schedule is saved.
 */
function ScheduleSummary() {
  const { t } = useLingui();
  const { values } = useFormContext<
    ScheduleFormValues & { daysToKeep?: number }
  >();
  const frequencies: Partial<Record<ScheduleFrequency, string>> = {
    minute: t`Minute`,
    hour: t`Hour`,
    day: t`Day`,
    week: t`Week`,
    month: t`Month`,
    year: t`Year`,
  };
  const describe = (list: ScheduleFrequency[] = []) =>
    list.length
      ? list.map((freq) => frequencies[freq]).join(', ')
      : t`None (Run Once)`;

  /* The start as typed, read in the zone it was typed for, then shown the way
     the detail page shows a run time. */
  const start = DateTime.fromFormat(
    `${values.startDate} ${values.startTime}`,
    'yyyy-LL-dd h:mm a',
    { zone: values.timezone }
  );

  return (
    <DetailList gutter="sm">
      <Detail label={t`Name`} value={values.name} dataCy="preview-name" />
      <Detail
        label={t`Description`}
        value={values.description}
        dataCy="preview-description"
      />
      <Detail
        label={t`Start Date/Time`}
        value={
          start.isValid
            ? formatDateString(start.toISO() as string, values.timezone)
            : `${values.startDate} ${values.startTime}`
        }
        dataCy="preview-first-run"
      />
      <Detail
        label={t`Local Time Zone`}
        value={values.timezone}
        dataCy="preview-timezone"
      />
      <Detail
        label={t`Repeat Frequency`}
        value={describe(values.frequency)}
        dataCy="preview-repeat-frequency"
      />
      {values.exceptionFrequency?.length ? (
        <Detail
          label={t`Exception Frequency`}
          value={describe(values.exceptionFrequency)}
          dataCy="preview-exception-frequency"
        />
      ) : null}
      {values.daysToKeep !== undefined ? (
        <Detail
          label={t`Days of Data to Keep`}
          value={values.daysToKeep}
          dataCy="preview-days-to-keep"
        />
      ) : null}
    </DetailList>
  );
}

export default ScheduleSummary;
