import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { DetailList, Detail } from 'components/DetailList';
import './RunOnDetail.css';

export interface RunOnDetailProps {
  /** What the target step answered, in a line. */
  summary: string;
}

/**
 * What the run is aimed at, above the preview of what it will do.
 *
 * The preview lists what the run sends, where the first step's answer only
 * shows as a limit, or as nothing at all where whole inventories were ticked.
 * This says it in the reader's own words, first, before anything else.
 */
function RunOnDetail({ summary }: RunOnDetailProps) {
  const { t } = useLingui();
  return (
    <DetailList gutter="sm" className="ascender-run-on">
      <Detail label={t`Run On`} value={summary} dataCy="run-on-detail" />
    </DetailList>
  );
}

export default RunOnDetail;
