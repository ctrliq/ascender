import type { Job, UnifiedJob } from 'types/api';
import { getJobModel } from 'util/jobs';
import type { QSParams } from 'util/qs';
import type { JobEvent } from './useJobEvents';

export async function fetchCount(job: UnifiedJob, params: QSParams) {
  const {
    data: { results: lastEvents = [] },
  } = await getJobModel(job.type).readEvents(job.id, {
    ...params,
    order_by: '-counter',
    limit: 1,
  });
  return lastEvents.length >= 1 ? lastEvents[0].counter : 0;
}

export function prependTraceback(job: Job, events: JobEvent[]) {
  let countOffset = 0;
  if (!job?.result_traceback) {
    return {
      events,
      countOffset,
    };
  }

  const tracebackEvent: JobEvent = {
    counter: 1,
    uuid: '',
    created: null,
    event: null,
    type: null,
    stdout: job?.result_traceback,
    start_line: 0,
  };
  const firstIndex = events.findIndex((jobEvent) => jobEvent.counter === 1);
  const firstEvent = events[firstIndex];
  if (firstEvent) {
    if (!firstEvent.stdout) {
      firstEvent.isTracebackOnly = true;
    }
    const stdoutLines = firstEvent.stdout?.split('\r\n') || [];
    stdoutLines[0] = tracebackEvent.stdout as string;
    firstEvent.stdout = stdoutLines.join('\r\n');
  } else {
    countOffset += 1;
    events.unshift(tracebackEvent);
  }

  return {
    events,
    countOffset,
  };
}
