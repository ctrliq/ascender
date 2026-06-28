
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';
import {
  useVirtualizer,
  defaultRangeExtractor,
} from '@tanstack/react-virtual';
import { Button, Alert } from '@patternfly/react-core';

import AlertModal from 'components/AlertModal';
import { CardBody as _CardBody } from 'components/Card';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import ErrorDetail from 'components/ErrorDetail';
import StatusLabel from 'components/StatusLabel';
import { JobsAPI } from 'api';

import { getJobModel, isJobRunning } from 'util/jobs';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import useInterval from 'hooks/useInterval';
import { parseQueryString, getQSConfig } from 'util/qs';
import useIsMounted from 'hooks/useIsMounted';
import JobEvent from './JobEvent';
import JobEventSkeleton from './JobEventSkeleton';
import PageControls from './PageControls';
import HostEventModal from './HostEventModal';
import JobOutputSearch from './JobOutputSearch';
import EmptyOutput from './EmptyOutput';
import { HostStatusBar, OutputToolbar } from './shared';
import getLineTextHtml from './getLineTextHtml';
import connectJobSocket, { closeWebSocket } from './connectJobSocket';
import getEventRequestParams from './getEventRequestParams';
import isHostEvent from './isHostEvent';
import { prependTraceback } from './loadJobEvents';
import useJobEvents from './useJobEvents';

const QS_CONFIG = getQSConfig('job_output', {
  order_by: 'counter',
});

const CardBody = styled(_CardBody)`
  display: flex;
  flex-flow: column;
  height: calc(100vh - 267px);
`;

const HeaderTitle = styled.div`
  display: inline-flex;
  align-items: center;
  h1 {
    font-weight: var(--pf-v6-global--FontWeight--bold);
  }
`;

const OutputHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;

  h1 {
    margin: 0;
  }
`;

const OutputWrapper = styled.div`
  background-color: var(--ascender-output-bg, #fff);
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  /* min-height: 0 lets this flex child shrink below its content height so the
     fixed-height CardBody bounds it; without it the column grows to fit all
     rows and the nested scroll container never constrains. */
  min-height: 0;
  font-family: monospace;
  font-size: 15px;
  outline: none;
  ${({ $cssMap }) =>
    Object.keys($cssMap).map(
      (className) => `.${className}{${$cssMap[className]}}`
    )}
`;

// The scroll container that hosts the virtualized rows. Replaces
// react-virtualized's AutoSizer + Grid. It must have a real height; the parent
// OutputWrapper is `flex: 1 1 auto` inside the flex-column CardBody, so this
// fills the remaining space and owns the scrollbar.
const ScrollContainer = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  position: relative;
  background-color: var(--ascender-output-bg, #fff);
`;

const OutputFooter = styled.div`
  background-color: var(--ascender-gutter-bg, #e8e8e8);
  border-right: none;
  width: 85px;
  flex: 1;
`;

export const MAX_SELECTION_OVERSCAN = 500;

export function computeOverscanIndices(
  { cellCount, overscanCellsCount, startIndex, stopIndex },
  selectedRowRange
) {
  const defaultStart = Math.max(0, startIndex - overscanCellsCount);
  const defaultStop = Math.min(cellCount - 1, stopIndex + overscanCellsCount);
  if (!selectedRowRange) {
    return {
      overscanStartIndex: defaultStart,
      overscanStopIndex: defaultStop,
    };
  }
  const selectionSpan = selectedRowRange.end - selectedRowRange.start;
  if (selectionSpan <= MAX_SELECTION_OVERSCAN) {
    const candidateStart = Math.min(
      defaultStart,
      Math.max(0, selectedRowRange.start)
    );
    const candidateStop = Math.max(
      defaultStop,
      Math.min(cellCount - 1, selectedRowRange.end)
    );
    if (candidateStop - candidateStart <= MAX_SELECTION_OVERSCAN) {
      return {
        overscanStartIndex: candidateStart,
        overscanStopIndex: candidateStop,
      };
    }
  }
  const viewMid = Math.floor((startIndex + stopIndex) / 2);
  const halfBudget = Math.floor(MAX_SELECTION_OVERSCAN / 2);
  const clampedStart = Math.max(selectedRowRange.start, viewMid - halfBudget);
  const clampedEnd = Math.min(selectedRowRange.end, viewMid + halfBudget);
  return {
    overscanStartIndex: Math.min(
      defaultStart,
      Math.max(0, clampedStart)
    ),
    overscanStopIndex: Math.max(
      defaultStop,
      Math.min(cellCount - 1, clampedEnd)
    ),
  };
}

// react-virtual's measureElement uses a ResizeObserver to dynamically size rows.
// On varied-height output a measure can shift layout within the same frame, so
// the browser emits the benign notice "ResizeObserver loop completed with
// undelivered notifications". It has no functional impact, but CRA's dev error
// overlay treats that window 'error' as fatal and blocks the whole UI.
//
// We must NOT fix this by deferring the observer callback (e.g. to
// requestAnimationFrame): react-virtual needs to apply the measured height in
// the same commit, and on a live job the component re-renders continuously as
// events stream in. A deferred measurement means each streaming render paints
// rows at their stale 25px estimate before the next frame corrects them, so the
// rows visibly overlap / garble / drop. Instead, leave the ResizeObserver
// callback synchronous and just swallow the benign loop notice at the window
// 'error' level before CRA's overlay sees it. Installed at module load (capture
// phase) so it runs before the overlay's own handler.
if (typeof window !== 'undefined' && !window.__ascResizeObserverErrorSilenced) {
  const isResizeObserverLoopError = (message) =>
    typeof message === 'string' &&
    message.includes('ResizeObserver loop');
  window.addEventListener(
    'error',
    (event) => {
      if (isResizeObserverLoopError(event.message)) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    },
    true
  );
  window.__ascResizeObserverErrorSilenced = true;
}

function JobOutput({ job, eventRelatedSearchableKeys, eventSearchableKeys, onJobRefresh }) {
  const { t } = useLingui();
  const location = useLocation();
  const parentRef = useRef(null);
  const jobSocketCounter = useRef(0);
  const isMounted = useIsMounted();
  const scrollTop = useRef(0);
  const scrollHeight = useRef(0);
  const navigate = useNavigate();
  const eventByUuidRequests = useRef([]);
  const eventsProcessedDelay = useRef(250);
  const outputRef = useRef(null);
  const totalRowsRef = useRef(0);
  const scrollToEndTimeout = useRef(null);

  const fetchEventByUuid = async (uuid) => {
    let promise = eventByUuidRequests.current[uuid];
    if (!promise) {
      promise = getJobModel(job.type).readEvents(job.id, { uuid });
      eventByUuidRequests.current[uuid] = promise;
    }
    const { data } = await promise;
    eventByUuidRequests.current[uuid] = null;
    return data.results[0] || null;
  };

  const fetchChildrenSummary = () => JobsAPI.readChildrenSummary(job.id);

  const [jobStatus, setJobStatus] = useState(job.status ?? 'waiting');
  const [forceFlatMode, setForceFlatMode] = useState(false);
  const isFlatMode =
    isJobRunning(jobStatus) || location.search.length > 1 || job.type !== 'job';
  const [isTreeReady, setIsTreeReady] = useState(false);
  const [onReadyEvents, setOnReadyEvents] = useState([]);

  const {
    addEvents,
    toggleNodeIsCollapsed,
    toggleCollapseAll,
    getEventForRow,
    getNumCollapsedEvents,
    getCounterForRow,
    getEvent,
    clearLoadedEvents,
    rebuildEventsTree,
    isAllCollapsed,
  } = useJobEvents(
    {
      fetchEventByUuid,
      fetchChildrenSummary,
      setForceFlatMode,
      setJobTreeReady: () => setIsTreeReady(true),
    },
    job.id,
    isFlatMode || forceFlatMode
  );
  const [wsEvents, setWsEvents] = useState([]);
  const [cssMap, setCssMap] = useState({});
  const [remoteRowCount, setRemoteRowCount] = useState(0);
  const [contentError, setContentError] = useState(null);
  const [currentlyLoading, setCurrentlyLoading] = useState([]);
  const [hasContentLoading, setHasContentLoading] = useState(true);
  const [hostEvent, setHostEvent] = useState({});
  const [isHostModalOpen, setIsHostModalOpen] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [highestLoadedCounter, setHighestLoadedCounter] = useState(0);
  const [isFollowModeEnabled, setIsFollowModeEnabled] = useState(
    isJobRunning(job.status)
  );
  const [isMonitoringWebsocket, setIsMonitoringWebsocket] = useState(false);
  const [lastScrollPosition, setLastScrollPosition] = useState(0);
  const [showEventsRefresh, setShowEventsRefresh] = useState(false);
  const [selectedRowRange, setSelectedRowRange] = useState(null);

  const totalNonCollapsedRows = Math.max(
    remoteRowCount - getNumCollapsedEvents(),
    0
  );
  totalRowsRef.current = totalNonCollapsedRows + wsEvents.length;
  const rowCount = totalNonCollapsedRows + wsEvents.length;

  // Selection-aware range extractor: always render the default visible range
  // plus, when there is an active text selection, the rows that span it (so the
  // browser selection is not collapsed by unmounting). Wired through the
  // preserved computeOverscanIndices pure function.
  const rangeExtractor = useCallback(
    (range) => {
      const { overscanStartIndex, overscanStopIndex } = computeOverscanIndices(
        {
          cellCount: range.count,
          overscanCellsCount: range.overscan,
          startIndex: range.startIndex,
          stopIndex: range.endIndex,
        },
        selectedRowRange
      );
      const set = new Set(defaultRangeExtractor(range));
      for (let i = overscanStartIndex; i <= overscanStopIndex; i++) {
        set.add(i);
      }
      return Array.from(set).sort((a, b) => a - b);
    },
    [selectedRowRange]
  );

  // useVirtualizer() returns functions the React Compiler can't memoize; this
  // component predates React Compiler, matching the rules already off in
  // eslint.config.mjs (set-state-in-effect, immutability, refs, purity).
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 25,
    overscan: 20,
    rangeExtractor,
    // A stable starting viewport so the virtualizer doesn't thrash when no live
    // ResizeObserver updates the rect (jsdom/tests). The real browser's
    // ResizeObserver updates this to the true size on mount.
    initialRect: { width: 1000, height: 600 },
  });

  // Passed to JobEvent / JobEventSkeleton as `measure` so they can request a
  // remeasure on content/image load — replacing react-virtualized's CellMeasurer
  // measure callback. This is intentionally a no-op: react-virtual's
  // measureElement attaches a ResizeObserver to every rendered row, so a row that
  // changes height (image load, expand/collapse) is re-measured automatically.
  //
  // It must NOT call rowVirtualizer.measure(): that resets the ENTIRE size cache
  // back to the 25px estimate, and a ResizeObserver only re-fires for rows whose
  // box actually changes — so already-settled rows stay stuck at the estimate.
  // On a live job, streaming JobEvents fire this constantly, which collapsed
  // every measured height and left the absolutely-positioned rows overlapping
  // (garbled / overlapping / missing rows).
  const remeasure = useCallback(() => {}, []);

  const scrollToRow = (rowIndex) => {
    setLastScrollPosition(rowIndex);
    // Read the row count from the ref so this works correctly even when invoked
    // from a memoized callback (scrollToEnd) that captured an earlier render.
    const currentRowCount = totalRowsRef.current;
    if (currentRowCount === 0) {
      return;
    }
    if (rowIndex < 0) {
      rowVirtualizer.scrollToIndex(currentRowCount - 1, { align: 'end' });
    } else {
      rowVirtualizer.scrollToIndex(Math.min(rowIndex, currentRowCount - 1), {
        align: 'auto',
      });
    }
  };

  const scrollToEnd = useCallback(() => {
    // Cancel any pending follow-up scroll before scheduling a new one, so rapid
    // scrollToEnd calls (live output) don't pile up timers. The handle is kept
    // in a ref because the previous `let timeout` was never assigned, making the
    // clearTimeout a no-op.
    if (scrollToEndTimeout.current) {
      clearTimeout(scrollToEndTimeout.current);
      scrollToEndTimeout.current = null;
    }
    scrollToRow(-1);
    if (isFollowModeEnabled) {
      // A second scroll after layout settles, so late dynamic-height row
      // measurements don't leave the view a little short of the end.
      scrollToEndTimeout.current = setTimeout(() => scrollToRow(-1), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFollowModeEnabled]);

  useEffect(
    () => () => {
      if (scrollToEndTimeout.current) {
        clearTimeout(scrollToEndTimeout.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!isTreeReady || !onReadyEvents.length) {
      return;
    }
    addEvents(onReadyEvents);
    setOnReadyEvents([]);
    if (isFollowModeEnabled) {
      setTimeout(() => {
        scrollToEnd();
      }, 0);
    }
  }, [isTreeReady, onReadyEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  useInterval(
    () => {
      monitorJobSocketCounter();
    },
    isMonitoringWebsocket ? 5000 : null
  );

  useEffect(() => {
    const pendingRequests = Object.values(eventByUuidRequests.current || {});
    setHasContentLoading(true); // prevents "no content found" screen from flashing
    if (location.search) {
      setIsFollowModeEnabled(false);
    }
    Promise.allSettled(pendingRequests).then(() => {
      setRemoteRowCount(0);
      clearLoadedEvents();
      loadJobEvents();
    });
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    rebuildEventsTree();
  }, [isFlatMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const pollForEventsProcessed = useCallback(async () => {
    const {
      data: { event_processing_finished },
    } = await getJobModel(job.type).readDetail(job.id);
    if (event_processing_finished) {
      setWsEvents([]);
      setRemoteRowCount(0);
      clearLoadedEvents();
      loadJobEvents();
      if (onJobRefresh) {
        onJobRefresh();
      }
      return;
    }
    const fiveMinutes = 1000 * 60 * 5;
    if (eventsProcessedDelay.current >= fiveMinutes) {
      return;
    }
    setTimeout(pollForEventsProcessed, eventsProcessedDelay.current);
    eventsProcessedDelay.current *= 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, job.type, lastScrollPosition]);

  useEffect(() => {
    if (!isJobRunning(jobStatus)) {
      if (wsEvents.length) {
        pollForEventsProcessed();
      }
      return;
    }
    let batchTimeout;
    let batchedEvents = [];
    const addBatchedEvents = () => {
      let min;
      let max;
      let newCssMap;
      batchedEvents.forEach((event) => {
        if (!min || event.counter < min) {
          min = event.counter;
        }
        if (!max || event.counter > max) {
          max = event.counter;
        }
        const { lineCssMap } = getLineTextHtml(event);
        newCssMap = {
          ...newCssMap,
          ...lineCssMap,
        };
      });
      setWsEvents((oldWsEvents) => {
        const newEvents = [];
        batchedEvents.forEach((event) => {
          if (!oldWsEvents.find((e) => e.id === event.id)) {
            newEvents.push(event);
          }
        });
        const updated = oldWsEvents.concat(newEvents);
        jobSocketCounter.current = updated.length;
        if (!oldWsEvents.length && min > remoteRowCount + 1) {
          loadJobEvents(min);
        }
        return updated.sort((a, b) => a.counter - b.counter);
      });
      setCssMap((prevCssMap) => ({
        ...prevCssMap,
        ...newCssMap,
      }));
      if (max > jobSocketCounter.current) {
        jobSocketCounter.current = max;
      }
      batchedEvents = [];
    };

    connectJobSocket(job, (data) => {
      if (data.group_name === `${job.type}_events`) {
        batchedEvents.push(data);
        clearTimeout(batchTimeout);
        if (batchedEvents.length >= 10) {
          addBatchedEvents();
        } else {
          batchTimeout = setTimeout(addBatchedEvents, 500);
        }
      }
      if (data.group_name === 'jobs' && data.unified_job_id === job.id) {
        if (data.final_counter) {
          jobSocketCounter.current = data.final_counter;
        }
        if (data.status) {
          setJobStatus(data.status);
        }
      }
    });
    setIsMonitoringWebsocket(true);

    // eslint-disable-next-line consistent-return
    return function cleanup() {
      clearTimeout(batchTimeout);
      closeWebSocket();
      setIsMonitoringWebsocket(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJobRunning(jobStatus), pollForEventsProcessed]);

  useEffect(() => {
    if (isFollowModeEnabled) {
      scrollToEnd();
    }
  }, [wsEvents.length, isFollowModeEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // NOTE: do NOT add an effect here that calls rowVirtualizer.measure() on
  // content changes (currentlyLoading/cssMap/remoteRowCount/wsEvents). measure()
  // clears the ENTIRE itemSizeCache back to the 25px estimateSize, and the
  // per-row ResizeObserver installed by measureElement only re-fires for rows
  // whose box actually changes — so already-settled rows stay stuck at the
  // estimate and the absolutely-positioned multi-line rows overlap. New/changed
  // rows are measured automatically when they mount or reflow.

  useEffect(() => {
    if (!jobStatus || isJobRunning(jobStatus)) {
      return;
    }

    if (isMonitoringWebsocket) {
      setIsMonitoringWebsocket(false);
    }

    if (isFollowModeEnabled) {
      setTimeout(() => setIsFollowModeEnabled(false), 1000);
    }
  }, [jobStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    error: cancelError,
    isLoading: isCancelling,
    request: cancelJob,
  } = useRequest(
    useCallback(async () => {
      await getJobModel(job.type).cancel(job.id);
    }, [job.id, job.type]),
    {}
  );

  const { error: dismissableCancelError, dismissError: dismissCancelError } =
    useDismissableError(cancelError);

  const {
    request: deleteJob,
    isLoading: isDeleting,
    error: deleteError,
  } = useRequest(
    useCallback(async () => {
      await getJobModel(job.type).destroy(job.id);

      navigate('/jobs');
    }, [job.type, job.id, navigate])
  );

  const { error: dismissableDeleteError, dismissError: dismissDeleteError } =
    useDismissableError(deleteError);

  // When the user has text selected inside the output area, expand the
  // virtualized render range to cover those rows so they are not
  // unmounted (which would collapse the browser selection).
  useEffect(() => {
    let rafId = null;
    const handleSelectionChange = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        handleSelectionChangeWork();
      });
    };
    const handleSelectionChangeWork = () => {
      const selection = window.getSelection();
      if (
        !outputRef.current ||
        !selection ||
        selection.isCollapsed ||
        selection.rangeCount === 0
      ) {
        setSelectedRowRange(null);
        return;
      }
      try {
        const range = selection.getRangeAt(0);
        if (!outputRef.current.contains(range.commonAncestorContainer)) {
          setSelectedRowRange(null);
          return;
        }
        const gridEl = parentRef.current;
        if (!gridEl) {
          setSelectedRowRange(null);
          return;
        }
        const containerRect = gridEl.getBoundingClientRect();
        const selRect = range.getBoundingClientRect();
        const currentScrollTop = scrollTop.current;
        const topAbs = selRect.top - containerRect.top + currentScrollTop;
        const bottomAbs = selRect.bottom - containerRect.top + currentScrollTop;

        // Map the selection's top/bottom pixel offsets to row indices using the
        // virtualizer's measurements (replaces the manual cumulative walk of
        // CellMeasurerCache.rowHeight). Pad by 1 like the original.
        const count = totalRowsRef.current;
        const topItem = rowVirtualizer.getVirtualItemForOffset(topAbs);
        const bottomItem = rowVirtualizer.getVirtualItemForOffset(bottomAbs);
        const startIdx = Math.max(0, (topItem ? topItem.index : 0) - 1);
        const endIdx = Math.min(
          count - 1,
          (bottomItem ? bottomItem.index : count - 1) + 1
        );
        setSelectedRowRange((prev) => {
          if (prev && prev.start === startIdx && prev.end === endIdx) {
            return prev;
          }
          return { start: startIdx, end: endIdx };
        });
      } catch (_) {
        setSelectedRowRange(null);
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      if (rafId) cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monitorJobSocketCounter = () => {
    if (
      jobSocketCounter.current === remoteRowCount &&
      !isJobRunning(job.status)
    ) {
      setIsMonitoringWebsocket(false);
    }
  };

  const loadJobEvents = async (firstWsCounter = null) => {
    const [params, loadRange] = getEventRequestParams(job, 50, [1, 50]);

    if (isMounted.current) {
      setHasContentLoading(true);
      setCurrentlyLoading((prevCurrentlyLoading) =>
        prevCurrentlyLoading.concat(loadRange)
      );
    }

    if (isFlatMode) {
      params.not__stdout = '';
    }
    if (firstWsCounter) {
      params.counter__lt = firstWsCounter;
    }
    const qsParams = parseQueryString(QS_CONFIG, location.search);
    const eventPromise = getJobModel(job.type).readEvents(job.id, {
      ...params,
      ...qsParams,
    });

    try {
      const {
        data: { count, results: fetchedEvents = [] },
      } = await eventPromise;

      if (!isMounted.current) {
        return;
      }
      let newCssMap;
      let rowNumber = 0;
      const { events, countOffset } = prependTraceback(job, fetchedEvents);
      events.forEach((event) => {
        event.rowNumber = rowNumber;
        rowNumber++;
        const { lineCssMap } = getLineTextHtml(event);
        newCssMap = {
          ...newCssMap,
          ...lineCssMap,
        };
      });
      setCssMap((prevCssMap) => ({
        ...prevCssMap,
        ...newCssMap,
      }));
      const lastCounter = events[events.length - 1]?.counter || 50;
      if (isTreeReady) {
        addEvents(events);
      } else {
        setOnReadyEvents((prev) => prev.concat(events));
      }
      setHighestLoadedCounter(lastCounter);
      setRemoteRowCount(count + countOffset);
    } catch (err) {
      setContentError(err);
    } finally {
      if (isMounted.current) {
        setHasContentLoading(false);
        setCurrentlyLoading((prevCurrentlyLoading) =>
          prevCurrentlyLoading.filter((n) => !loadRange.includes(n))
        );
      }
    }
  };

  const isRowLoaded = ({ index }) => {
    let counter;
    try {
      counter = getCounterForRow(index);
    } catch (e) {
      console.error(e); // eslint-disable-line no-console
      return false;
    }
    if (getEvent(counter)) {
      return true;
    }
    if (index >= remoteRowCount && index < remoteRowCount + wsEvents.length) {
      return true;
    }
    return currentlyLoading.includes(counter);
  };

  const handleHostEventClick = (hostEventToOpen) => {
    setHostEvent(hostEventToOpen);
    setIsHostModalOpen(true);
  };

  const handleHostModalClose = () => {
    setIsHostModalOpen(false);
  };

  const renderRow = (index) => {
    let event;
    let node;
    try {
      const eventForRow = getEventForRow(index) || {};
      event = eventForRow.event;
      node = eventForRow.node;
    } catch (e) {
      event = null;
    }
    if (
      !event &&
      index >= remoteRowCount &&
      index < remoteRowCount + wsEvents.length
    ) {
      event = wsEvents[index - remoteRowCount];
      node = {
        eventIndex: event?.counter,
        isCollapsed: false,
        children: [],
      };
    }
    let actualLineTextHtml = [];
    if (event) {
      const { lineTextHtml } = getLineTextHtml(event);
      actualLineTextHtml = lineTextHtml;
    }

    // The wrapping virtual-row div (measureElement) owns the absolute
    // positioning, so JobEvent/JobEventSkeleton get an empty style — their
    // internal layout is unchanged.
    return event ? (
      <JobEvent
        isClickable={isHostEvent(event)}
        onJobEventClick={() => handleHostEventClick(event)}
        className="row"
        style={{}}
        lineTextHtml={actualLineTextHtml}
        index={index}
        event={event}
        measure={remeasure}
        isCollapsed={node.isCollapsed}
        hasChildren={node.children.length}
        onToggleCollapsed={() => {
          toggleNodeIsCollapsed(event.uuid, !node.isCollapsed);
        }}
        jobStatus={jobStatus}
      />
    ) : (
      <JobEventSkeleton
        className="row"
        style={{}}
        counter={index}
        contentLength={80}
        measure={remeasure}
      />
    );
  };

  const loadMoreRows = async ({ startIndex, stopIndex }) => {
    if (!isMounted.current) {
      return;
    }
    if (startIndex === 0 && stopIndex === 0) {
      return;
    }

    if (isMounted.current) {
      setCurrentlyLoading((prevCurrentlyLoading) =>
        prevCurrentlyLoading.concat(loadRange)
      );
    }

    let range = [startIndex, stopIndex];
    if (!isFlatMode) {
      const diff = stopIndex - startIndex;
      const startCounter = getCounterForRow(startIndex);
      range = [startCounter, startCounter + diff];
    }

    const [requestParams, loadRange] = getEventRequestParams(
      job,
      remoteRowCount,
      range
    );
    const qs = parseQueryString(QS_CONFIG, location.search);
    const params = {
      ...requestParams,
      ...qs,
    };
    if (isFlatMode) {
      params.not__stdout = '';
    }

    const model = getJobModel(job.type);

    let response;
    try {
      response = await model.readEvents(job.id, params);
    } catch (error) {
      if (error.response.status === 404) {
        return;
      }
      throw error;
    }
    if (!isMounted.current) {
      return;
    }
    const events = response.data.results;
    const firstIndex = (params.page - 1) * params.page_size;

    let newCssMap;
    let rowNumber = firstIndex;
    events.forEach((event) => {
      event.rowNumber = rowNumber;
      rowNumber++;
      const { lineCssMap } = getLineTextHtml(event);
      newCssMap = {
        ...newCssMap,
        ...lineCssMap,
      };
    });
    setCssMap((prevCssMap) => ({
      ...prevCssMap,
      ...newCssMap,
    }));

    const lastCounter = events[events.length - 1]?.counter || 50;
    addEvents(events);
    if (lastCounter > highestLoadedCounter) {
      setHighestLoadedCounter(lastCounter);
    }
    setCurrentlyLoading((prevCurrentlyLoading) =>
      prevCurrentlyLoading.filter((n) => !loadRange.includes(n))
    );
    if (isFollowModeEnabled) {
      scrollToEnd();
    }
  };

  // Infinite-load driver (no @tanstack/react-virtual equivalent of
  // react-virtualized's InfiniteLoader): whenever the rendered range changes,
  // find the first unloaded row within it and load a batch of >= 50 rows
  // around it. currentlyLoading guards against duplicate concurrent loads.
  const virtualItems = rowVirtualizer.getVirtualItems();
  // Rendered range as primitives — depending on the getVirtualItems() array ref
  // would re-run this effect every render and churn loads endlessly.
  const renderedStart = virtualItems.length ? virtualItems[0].index : 0;
  const renderedStop = virtualItems.length
    ? virtualItems[virtualItems.length - 1].index
    : 0;
  // Dedupe: don't re-request the same unloaded boundary while it is in flight.
  const lastLoadStartRef = useRef(-1);
  useEffect(() => {
    if (hasContentLoading || rowCount === 0 || !virtualItems.length) {
      return;
    }
    // No viewport (e.g. jsdom, or a not-yet-laid-out container) => nothing is
    // really visible, so don't drive infinite-load (which would otherwise loop).
    if (!parentRef.current || parentRef.current.clientHeight === 0) {
      return;
    }
    let firstUnloaded = -1;
    for (let i = renderedStart; i <= renderedStop; i++) {
      if (!isRowLoaded({ index: i })) {
        firstUnloaded = i;
        break;
      }
    }
    if (firstUnloaded === -1) {
      lastLoadStartRef.current = -1;
      return;
    }
    if (firstUnloaded === lastLoadStartRef.current) {
      // already requested this boundary; wait for it to resolve
      return;
    }
    lastLoadStartRef.current = firstUnloaded;
    const minimumBatchSize = 50;
    const startIndex = firstUnloaded;
    const stopIndex = Math.min(
      rowCount - 1,
      Math.max(renderedStop, startIndex + minimumBatchSize - 1)
    );
    loadMoreRows({ startIndex, stopIndex });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    renderedStart,
    renderedStop,
    hasContentLoading,
    rowCount,
    remoteRowCount,
    currentlyLoading,
  ]);

  const handleScrollPrevious = () => {
    const startIndex = rowVirtualizer.range?.startIndex ?? 0;
    const stopIndex = rowVirtualizer.range?.endIndex ?? 0;
    const scrollRange = stopIndex - startIndex;
    scrollToRow(Math.max(0, startIndex - scrollRange));
    setIsFollowModeEnabled(false);
  };

  const handleScrollNext = () => {
    const startIndex = rowVirtualizer.range?.startIndex ?? 0;
    const stopIndex = rowVirtualizer.range?.endIndex ?? 0;
    const scrollRange = stopIndex - startIndex;
    scrollToRow(stopIndex + scrollRange);
  };

  const handleScrollFirst = () => {
    scrollToRow(0);
    setIsFollowModeEnabled(false);
  };

  const handleScrollLast = () => {
    scrollToEnd();
    setIsFollowModeEnabled(true);
  };

  const handleScroll = (e) => {
    const target = e.currentTarget;
    if (
      isFollowModeEnabled &&
      scrollTop.current > target.scrollTop &&
      scrollHeight.current === target.scrollHeight
    ) {
      setIsFollowModeEnabled(false);
    }
    scrollTop.current = target.scrollTop;
    scrollHeight.current = target.scrollHeight;
    if (target.scrollTop + target.clientHeight >= target.scrollHeight) {
      setIsFollowModeEnabled(true);
    }
  };

  // Width changes are handled automatically by measureElement: every rendered
  // row carries a per-element ResizeObserver, so when the container width
  // changes the visible rows reflow and are re-measured individually. We must
  // NOT call rowVirtualizer.measure() here — it clears the whole size cache back
  // to the 25px estimate and, since the per-row observers only re-fire for rows
  // whose box actually changes, unchanged rows stay stuck at the estimate and
  // the multi-line rows overlap.

  const handleExpandCollapseAll = () => {
    toggleCollapseAll(!isAllCollapsed);
  };

  if (contentError) {
    return <ContentError error={contentError} />;
  }

  const showEmptyOutput =
    !hasContentLoading && remoteRowCount + wsEvents.length === 0;

  return (
    <>
      <CardBody>
        {isHostModalOpen && (
          <HostEventModal
            onClose={handleHostModalClose}
            isOpen={isHostModalOpen}
            hostEvent={hostEvent}
          />
        )}
        <OutputHeader>
          <HeaderTitle>
            <h1>{job.name}</h1>
            <StatusLabel status={job.status} />
          </HeaderTitle>
          <OutputToolbar
            job={job}
            jobStatus={jobStatus}
            onCancel={() => setShowCancelModal(true)}
            onDelete={deleteJob}
            isDeleteDisabled={isDeleting}
          />
        </OutputHeader>
        <HostStatusBar counts={job.host_status_counts || {}} />
        <JobOutputSearch
          qsConfig={QS_CONFIG}
          job={job}
          eventRelatedSearchableKeys={eventRelatedSearchableKeys}
          eventSearchableKeys={eventSearchableKeys}
          scrollToEnd={scrollToEnd}
          isFollowModeEnabled={isFollowModeEnabled}
          setIsFollowModeEnabled={setIsFollowModeEnabled}
        />
        {showEventsRefresh ? (
          <Alert
            variant="custom"
            title={
              <>
                {t`Events processing complete.`}{' '}
                <Button
                  variant="link"
                  isInline
                  onClick={() => {
                    loadJobEvents().then(() => {
                      setWsEvents([]);
                    });
                    setShowEventsRefresh(false);
                  }}
                >
                  {t`Reload output`}
                </Button>
              </>
            }
          />
        ) : null}
        <PageControls
          onScrollFirst={handleScrollFirst}
          onScrollLast={handleScrollLast}
          onScrollNext={handleScrollNext}
          onScrollPrevious={handleScrollPrevious}
          toggleExpandCollapseAll={handleExpandCollapseAll}
          isFlatMode={isFlatMode || forceFlatMode}
          isTemplateJob={job.type === 'job'}
          isAllCollapsed={isAllCollapsed}
        />
        <OutputWrapper ref={outputRef} $cssMap={cssMap} className="ascender-output-wrapper">
          {showEmptyOutput ? (
            <EmptyOutput
              job={job}
              hasQueryParams={location.search.length > 1}
              isJobRunning={isJobRunning(jobStatus)}
              // EmptyOutput calls onUnmount on every render (its effect has no
              // dep array), so this must not trigger a re-render. The original
              // called listRef.current?.recomputeRowHeights() which was a no-op
              // here (no <List> mounted in the empty branch); react-virtual
              // re-measures automatically when real content mounts.
              onUnmount={() => {}}
            />
          ) : (
            <ScrollContainer ref={parentRef} onScroll={handleScroll} className="ascender-output-scroll">
              {hasContentLoading ? (
                <ContentLoading />
              ) : (
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      bottom: 0,
                      width: 85,
                      backgroundColor: 'var(--ascender-gutter-bg, #e8e8e8)',
                      zIndex: 0,
                    }}
                  />
                  {rowVirtualizer.getVirtualItems().map((virtualItem) => (
                    <div
                      key={virtualItem.key}
                      data-index={virtualItem.index}
                      ref={rowVirtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${Math.round(virtualItem.start)}px)`,
                      }}
                    >
                      {renderRow(virtualItem.index)}
                    </div>
                  ))}
                </div>
              )}
            </ScrollContainer>
          )}
          <OutputFooter />
        </OutputWrapper>
      </CardBody>
      {showCancelModal && isJobRunning(job.status) && (
        <AlertModal
          isOpen={showCancelModal}
          variant="danger"
          onClose={() => setShowCancelModal(false)}
          title={t`Cancel Job`}
          label={t`Cancel Job`}
          actions={[
            <Button
              id="cancel-job-confirm-button"
              key="delete"
              variant="danger"
              isDisabled={isCancelling}
              aria-label={t`Cancel job`}
              onClick={cancelJob}
            >
              {t`Cancel job`}
            </Button>,
            <Button
              id="cancel-job-return-button"
              key="cancel"
              variant="secondary"
              aria-label={t`Return`}
              onClick={() => setShowCancelModal(false)}
            >
              {t`Return`}
            </Button>,
          ]}
        >
          {t`Are you sure you want to submit the request to cancel this job?`}
        </AlertModal>
      )}
      {dismissableDeleteError && (
        <AlertModal
          isOpen={dismissableDeleteError}
          variant="danger"
          onClose={dismissDeleteError}
          title={t`Job Delete Error`}
          label={t`Job Delete Error`}
        >
          <ErrorDetail error={dismissableDeleteError} />
        </AlertModal>
      )}
      {dismissableCancelError && (
        <AlertModal
          isOpen={dismissableCancelError}
          variant="danger"
          onClose={dismissCancelError}
          title={t`Job Cancel Error`}
          label={t`Job Cancel Error`}
        >
          <ErrorDetail error={dismissableCancelError} />
        </AlertModal>
      )}
    </>
  );
}

export default JobOutput;
