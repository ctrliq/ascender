import type {
  DetailedError,
  OptionsResponse,
  SetBreadcrumb,
  SummaryFieldRef,
  WorkflowJobTemplateNode,
} from 'types/api';
import React, { useEffect, useCallback, useRef, useState } from 'react';
import {
  Link,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation,
} from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card as PFCard, PageSection } from '@patternfly/react-core';
import { InventorySourcesAPI } from 'api';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import RoutedTabs from 'components/RoutedTabs';
import type { RoutedTab } from 'components/RoutedTabs';
import { getSearchableKeys } from 'components/PaginatedTable';
import useRequest from 'hooks/useRequest';
import { getJobModel } from 'util/jobs';
import WorkflowOutputNavigation from 'components/WorkflowOutputNavigation';
import JobDetail from './JobDetail';
import JobOutput from './JobOutput';
import { WorkflowOutput } from './WorkflowOutput';
import useWsJob from './useWsJob';
import './Job.css';

// maps the displayed url segments to actual api types
export const JOB_URL_SEGMENT_MAP = {
  playbook: 'job',
  project: 'project_update',
  management: 'system_job',
  system: 'system_job',
  inventory: 'inventory_update',
  command: 'ad_hoc_command',
  workflow: 'workflow_job',
};

export interface JobProps {
  setBreadcrumb: SetBreadcrumb;
  [key: string]: unknown;
}

function Job({ setBreadcrumb }: JobProps) {
  const { t } = useLingui();
  const { pathname } = useLocation();
  const { id, typeSegment } = useParams() as {
    id: string;
    typeSegment: string;
  };

  const type =
    JOB_URL_SEGMENT_MAP[typeSegment as keyof typeof JOB_URL_SEGMENT_MAP];

  /*
   * Whether the routed content is on screen. Only the playbook output reads
   * anything of its own before it can draw, so it is the only tab that reports:
   * everything else is ready as soon as the job is.
   *
   * Held as the id of the job whose output said so rather than as a flag. The
   * workflow navigator moves this same page to a sibling job by changing the
   * id alone, and a flag would stay true from the job before, uncovering the
   * next one's output before it had drawn anything.
   */
  const [readyOutputId, setReadyOutputId] = useState<string | null>(null);
  const isOutputReady = readyOutputId === id;
  const handleContentReady = useCallback(() => setReadyOutputId(id), [id]);

  const {
    isLoading,
    error,
    request: fetchJob,
    result: {
      jobDetail,
      eventRelatedSearchableKeys,
      eventSearchableKeys,
      inventorySourceChoices,
      relatedJobs,
    },
  } = useRequest(
    useCallback(async () => {
      let eventOptions: Partial<OptionsResponse> = {};
      // The nodes of the workflow this job was launched from, which the
      // navigation between sibling jobs is built out of.
      let relatedJobData: WorkflowJobTemplateNode[] = [];
      const { data: jobDetailData } = await getJobModel(type).readDetail(id);
      if (type !== 'workflow_job') {
        const { data: jobEventOptions } =
          await getJobModel(type).readEventOptions(id);
        eventOptions = jobEventOptions;
      }
      if (jobDetailData.related.source_workflow_job) {
        const {
          data: { results },
        } = await getJobModel('workflow_job').readNodes(
          jobDetailData.summary_fields.source_workflow_job?.id as number,
          // without this the API returns its default page of 25, which
          // truncates the workflow navigation menu; 200 is MAX_PAGE_SIZE
          { page_size: 200 }
        );
        relatedJobData = results;
      }
      if (
        jobDetailData?.summary_fields?.credentials?.find(
          (cred: SummaryFieldRef) => cred.kind === 'vault'
        )
      ) {
        const {
          data: { results },
        } = await getJobModel(type).readCredentials(jobDetailData.id);

        jobDetailData.summary_fields.credentials = results as SummaryFieldRef[];
      }

      setBreadcrumb(jobDetailData);
      let choices;
      if (jobDetailData.type === 'inventory_update') {
        choices = await InventorySourcesAPI.readOptions();
      }

      return {
        inventorySourceChoices:
          choices?.data?.actions?.GET?.source?.choices || [],
        jobDetail: jobDetailData,
        relatedJobs: relatedJobData,
        eventRelatedSearchableKeys: (
          eventOptions?.related_search_fields || []
        ).map((val: string) => val.slice(0, -8)),
        eventSearchableKeys: getSearchableKeys(eventOptions?.actions?.GET),
      };
    }, [id, type, setBreadcrumb]),
    {
      jobDetail: null,
      inventorySourceChoices: [],
      eventRelatedSearchableKeys: [],
      eventSearchableKeys: [],
      relatedJobs: [],
    }
  );

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  const job = useWsJob(jobDetail);

  /*
   * The playbook output is the one tab that reads more before it can draw, so
   * it is the one the page waits on. Anything else is ready once the job is.
   */
  const waitsForOutput =
    pathname.endsWith('/output') && job?.type !== 'workflow_job';
  const isContentReady =
    Boolean(jobDetail) && (!waitsForOutput || isOutputReady);
  const ref = useRef(null);
  const tabsArray: RoutedTab[] = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Runs`}
        </>
      ),
      link: `/runs`,
      persistentFilterKey: 'jobs',
      id: 99,
    },
    {
      name: t`Details`,
      link: `/runs/${typeSegment}/${id}/details`,
      id: 0,
    },
    { name: t`Output`, link: `/runs/${typeSegment}/${id}/output`, id: 1 },
  ];
  const sourceWorkflowJob = job?.summary_fields?.source_workflow_job;
  if (relatedJobs?.length > 0) {
    /*
     * A job launched by a workflow is read from inside that workflow's run, so
     * it gets the way back the list gets: the same caret and wording as Back to
     * Jobs, beside the selector that walks the run's other jobs rather than
     * among the tabs, since it leaves the job rather than moving within it.
     */
    if (sourceWorkflowJob?.id) {
      tabsArray.push({
        name: (
          <Link
            className="ascender-job__back-to-workflow"
            to={`/runs/workflow/${sourceWorkflowJob.id}/output`}
          >
            <CaretLeftIcon />
            {t`Back to Workflow`}
          </Link>
        ),
        link: undefined,
        id: 98,
      });
    }
    tabsArray.push({
      name: (
        <WorkflowOutputNavigation parentRef={ref} relatedJobs={relatedJobs} />
      ),
      link: undefined,
      id: 2,
    });
  }

  if (isLoading && !jobDetail) {
    return (
      <PageSection hasBodyWrapper={false}>
        <ContentLoading />
      </PageSection>
    );
  }

  if (error) {
    return (
      <PageSection hasBodyWrapper={false}>
        <PFCard>
          <ContentError error={error}>
            {(error as DetailedError).response?.status === 404 && (
              <span>
                {t`The page you requested could not be found.`}{' '}
                <Link to="/runs">{t`View all Runs.`}</Link>
              </span>
            )}
          </ContentError>
        </PFCard>
      </PageSection>
    );
  }

  /*
   * Output fills the page, whether it is a playbook's or a workflow's graph:
   * both are as tall as the window allows and scroll inside themselves, and
   * both end at the same line. Details is a short list, and the same card there
   * would leave empty space under its buttons.
   *
   * Asked as not-details rather than is-output so the index route, which
   * redirects to output, is tall from the first paint instead of resizing once
   * the redirect lands.
   */
  const isFilling = !pathname.endsWith('/details');

  return (
    <PageSection
      hasBodyWrapper={false}
      className={
        [
          isFilling ? 'ascender-job__fill-section' : null,
          isContentReady ? null : 'ascender-job__awaiting-content',
        ]
          .filter(Boolean)
          .join(' ') || undefined
      }
    >
      {/*
        One loading animation for the whole page. The card below is mounted the
        whole time, because the output has to be on screen to read its own
        height and fetch its first events, but it stays invisible until it says
        it is ready: what the page shows until then is this, in the place the
        page level loading animation had it, so the two read as one.
      */}
      {!isContentReady && (
        <div className="ascender-job__loading-overlay">
          <ContentLoading />
        </div>
      )}
      <div ref={ref} className={isFilling ? 'ascender-job__fill' : undefined}>
        <PFCard className={isFilling ? 'ascender-job__fill-card' : undefined}>
          <RoutedTabs
            isWorkflow={typeSegment === 'workflow'}
            tabsArray={tabsArray}
          />
          <Routes>
            <Route index element={<Navigate to="output" replace />} />
            {job && String(job.id) === id && (
              <Route
                path="details"
                element={
                  <JobDetail
                    job={job}
                    inventorySourceLabels={inventorySourceChoices}
                  />
                }
              />
            )}
            {job && String(job.id) === id && (
              <Route
                path="output"
                element={
                  job.type === 'workflow_job' ? (
                    <WorkflowOutput key={id} job={job} />
                  ) : (
                    <JobOutput
                      key={id}
                      job={job}
                      eventRelatedSearchableKeys={eventRelatedSearchableKeys}
                      eventSearchableKeys={eventSearchableKeys}
                      onJobRefresh={fetchJob}
                      onContentReady={handleContentReady}
                    />
                  )
                }
              />
            )}
            <Route
              path="*"
              element={
                <ContentError isNotFound>
                  <Link to={`/runs/${typeSegment}/${id}/details`}>
                    {t`View Job Details`}
                  </Link>
                </ContentError>
              }
            />
          </Routes>
        </PFCard>
      </div>
    </PageSection>
  );
}

export default Job;
export { Job as _Job };
