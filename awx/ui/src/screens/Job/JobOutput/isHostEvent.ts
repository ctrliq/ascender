import type { JobEvent } from './useJobEvents';

export default function isHostEvent(jobEvent: JobEvent) {
  const { event, event_data: eventData, host, type } = jobEvent;
  let isHost;
  if (typeof host === 'number' || (eventData && eventData.res)) {
    isHost = true;
  } else if (
    type === 'project_update_event' &&
    event !== 'runner_on_skipped' &&
    eventData?.host
  ) {
    isHost = true;
  } else {
    isHost = false;
  }
  return isHost;
}
