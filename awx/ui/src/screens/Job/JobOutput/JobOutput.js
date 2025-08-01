/* eslint-disable react/jsx-no-useless-fragment */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import styled from 'styled-components';
import {
  AutoSizer,
  CellMeasurer,
  CellMeasurerCache,
  InfiniteLoader,
  List,
} from 'react-virtualized';
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
    margin-right: 10px;
    font-weight: var(--pf-global--FontWeight--bold);
  }
`;

const OutputHeader = styled.div`
  display: flex;
  justify-content: space-between;
`;

const OutputWrapper = styled.div`
  background-color: #ffffff;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  font-family: monospace;
  font-size: 15px;
  outline: 1px solid #d7d7d7;
  ${({ cssMap }) =>
    Object.keys(cssMap).map(
      (className) => `.${className}{${cssMap[className]}}`
    )}
`;

const OutputFooter = styled.div`
  background-color: #ebebeb;
  border-right: 1px solid #d7d7d7;
  width: 75px;
  flex: 1;
`;

const cache = new CellMeasurerCache({
  fixedWidth: true,
  defaultHeight: 25,
});

function JobOutput({ job, eventRelatedSearchableKeys, eventSearchableKeys }) {
  const { i18n } = useLingui();
  const location = useLocation();
  const listRef = useRef(null);
  const previousWidth = useRef(0);
  const jobSocketCounter = useRef(0);
  const isMounted = useIsMounted();
  const scrollTop = useRef(0);
  const scrollHeight = useRef(0);
  const history = useHistory();
  const eventByUuidRequests = useRef([]);
  const eventsProcessedDelay = useRef(250);

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

  const totalNonCollapsedRows = Math.max(
    remoteRowCount - getNumCollapsedEvents(),
    0
  );

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
      setShowEventsRefresh(true);
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
      isMounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJobRunning(jobStatus), pollForEventsProcessed]);

  useEffect(() => {
    if (isFollowModeEnabled) {
      scrollToEnd();
    }
  }, [wsEvents.length, isFollowModeEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (listRef.current?.recomputeRowHeights) {
      listRef.current.recomputeRowHeights();
    }
  }, [currentlyLoading, cssMap, remoteRowCount, wsEvents.length]);

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

      history.push('/jobs');
    }, [job.type, job.id, history])
  );

  const { error: dismissableDeleteError, dismissError: dismissDeleteError } =
    useDismissableError(deleteError);

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
        loadRange.forEach((n) => {
          cache.clear(n);
        });
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

  const rowRenderer = ({ index, parent, key, style }) => {
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

    return (
      <CellMeasurer
        key={key}
        cache={cache}
        parent={parent}
        rowIndex={index}
        columnIndex={0}
      >
        {({ measure }) =>
          event ? (
            <JobEvent
              isClickable={isHostEvent(event)}
              onJobEventClick={() => handleHostEventClick(event)}
              className="row"
              style={style}
              lineTextHtml={actualLineTextHtml}
              index={index}
              event={event}
              measure={measure}
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
              style={style}
              counter={index}
              contentLength={80}
              measure={measure}
            />
          )
        }
      </CellMeasurer>
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
    loadRange.forEach((n) => {
      cache.clear(n);
    });
    if (isFollowModeEnabled) {
      scrollToEnd();
    }
  };

  const scrollToRow = (rowIndex) => {
    setLastScrollPosition(rowIndex);
    if (listRef.current) {
      listRef.current.scrollToRow(rowIndex);
    }
  };

  const handleScrollPrevious = () => {
    const startIndex = listRef.current.Grid._renderedRowStartIndex;
    const stopIndex = listRef.current.Grid._renderedRowStopIndex;
    const scrollRange = stopIndex - startIndex;
    scrollToRow(Math.max(0, startIndex - scrollRange));
    setIsFollowModeEnabled(false);
  };

  const handleScrollNext = () => {
    const startIndex = listRef.current.Grid._renderedRowStartIndex;
    const stopIndex = listRef.current.Grid._renderedRowStopIndex;
    const scrollRange = stopIndex - startIndex;
    scrollToRow(stopIndex + scrollRange);
  };

  const handleScrollFirst = () => {
    scrollToRow(0);
    setIsFollowModeEnabled(false);
  };

  const scrollToEnd = useCallback(() => {
    scrollToRow(-1);
    let timeout;
    if (isFollowModeEnabled) {
      setTimeout(() => scrollToRow(-1), 100);
    }
    return () => clearTimeout(timeout);
  }, [isFollowModeEnabled]);

  const handleScrollLast = () => {
    scrollToEnd();
    setIsFollowModeEnabled(true);
  };

  const handleResize = ({ width }) => {
    if (width !== previousWidth) {
      cache.clearAll();
      if (listRef.current?.recomputeRowHeights) {
        listRef.current.recomputeRowHeights();
      }
    }
    previousWidth.current = width;
  };

  const handleScroll = (e) => {
    if (
      isFollowModeEnabled &&
      scrollTop.current > e.scrollTop &&
      scrollHeight.current === e.scrollHeight
    ) {
      setIsFollowModeEnabled(false);
    }
    scrollTop.current = e.scrollTop;
    scrollHeight.current = e.scrollHeight;
    if (e.scrollTop + e.clientHeight >= e.scrollHeight) {
      setIsFollowModeEnabled(true);
    }
  };

  const handleExpandCollapseAll = () => {
    toggleCollapseAll(!isAllCollapsed);
  };

  if (contentError) {
    return <ContentError error={contentError} />;
  }

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
            variant="default"
            title={
              <>
                {i18n._(msg`Events processing complete.`)}{' '}
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
                  {i18n._(msg`Reload output`)}
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
        <OutputWrapper cssMap={cssMap}>
          <InfiniteLoader
            isRowLoaded={isRowLoaded}
            loadMoreRows={loadMoreRows}
            rowCount={totalNonCollapsedRows + wsEvents.length}
            minimumBatchSize={50}
          >
            {({ onRowsRendered, registerChild }) => {
              if (
                !hasContentLoading &&
                remoteRowCount + wsEvents.length === 0
              ) {
                return (
                  <EmptyOutput
                    job={job}
                    hasQueryParams={location.search.length > 1}
                    isJobRunning={isJobRunning(jobStatus)}
                    onUnmount={() => {
                      if (listRef.current?.recomputeRowHeights) {
                        listRef.current.recomputeRowHeights();
                      }
                    }}
                  />
                );
              }
              return (
                <AutoSizer nonce={window.NONCE_ID} onResize={handleResize}>
                  {({ width, height }) => (
                    <>
                      {hasContentLoading ? (
                        <div style={{ width }}>
                          <ContentLoading />
                        </div>
                      ) : (
                        <List
                          ref={(ref) => {
                            registerChild(ref);
                            listRef.current = ref;
                          }}
                          deferredMeasurementCache={cache}
                          height={height || 1}
                          onRowsRendered={onRowsRendered}
                          rowCount={totalNonCollapsedRows + wsEvents.length}
                          rowHeight={cache.rowHeight}
                          rowRenderer={rowRenderer}
                          width={width || 1}
                          overscanRowCount={20}
                          onScroll={handleScroll}
                        />
                      )}
                    </>
                  )}
                </AutoSizer>
              );
            }}
          </InfiniteLoader>
          <OutputFooter />
        </OutputWrapper>
      </CardBody>
      {showCancelModal && isJobRunning(job.status) && (
        <AlertModal
          isOpen={showCancelModal}
          variant="danger"
          onClose={() => setShowCancelModal(false)}
          title={i18n._(msg`Cancel Job`)}
          label={i18n._(msg`Cancel Job`)}
          actions={[
            <Button
              id="cancel-job-confirm-button"
              key="delete"
              variant="danger"
              isDisabled={isCancelling}
              aria-label={i18n._(msg`Cancel job`)}
              onClick={cancelJob}
            >
              {i18n._(msg`Cancel job`)}
            </Button>,
            <Button
              id="cancel-job-return-button"
              key="cancel"
              variant="secondary"
              aria-label={i18n._(msg`Return`)}
              onClick={() => setShowCancelModal(false)}
            >
              {i18n._(msg`Return`)}
            </Button>,
          ]}
        >
          {i18n._(
            msg`Are you sure you want to submit the request to cancel this job?`
          )}
        </AlertModal>
      )}
      {dismissableDeleteError && (
        <AlertModal
          isOpen={dismissableDeleteError}
          variant="danger"
          onClose={dismissDeleteError}
          title={i18n._(msg`Job Delete Error`)}
          label={i18n._(msg`Job Delete Error`)}
        >
          <ErrorDetail error={dismissableDeleteError} />
        </AlertModal>
      )}
      {dismissableCancelError && (
        <AlertModal
          isOpen={dismissableCancelError}
          variant="danger"
          onClose={dismissCancelError}
          title={i18n._(msg`Job Cancel Error`)}
          label={i18n._(msg`Job Cancel Error`)}
        >
          <ErrorDetail error={dismissableCancelError} />
        </AlertModal>
      )}
    </>
  );
}

export default JobOutput;
