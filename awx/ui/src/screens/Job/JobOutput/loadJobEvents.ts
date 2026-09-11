import type { Untyped } from 'types/api';
import { getJobModel } from 'util/jobs';

export async function fetchCount(job: Untyped, params: Untyped) {
  const {
    data: { results: lastEvents = [] },
  } = await getJobModel(job.type).readEvents(job.id, {
    ...params,
    order_by: '-counter',
    limit: 1,
  });
  return lastEvents.length >= 1 ? lastEvents[0].counter : 0;
}

export function prependTraceback(job: Untyped, events: Untyped) {
  let countOffset = 0;
  if (!job?.result_traceback) {
    return {
      events,
      countOffset,
    };
  }

  const tracebackEvent = {
    counter: 1,
    created: null,
    event: null,
    type: null,
    stdout: job?.result_traceback,
    start_line: 0,
  };
  const firstIndex = events.findIndex(
    (jobEvent: Untyped) => jobEvent.counter === 1
  );
  if (firstIndex > -1) {
    if (!events[firstIndex].stdout) {
      events[firstIndex].isTracebackOnly = true;
    }
    const stdoutLines = events[firstIndex].stdout?.split('\r\n') || [];
    stdoutLines[0] = tracebackEvent.stdout;
    events[firstIndex].stdout = stdoutLines.join('\r\n');
  } else {
    countOffset += 1;
    events.unshift(tracebackEvent);
  }

  return {
    events,
    countOffset,
  };
}
