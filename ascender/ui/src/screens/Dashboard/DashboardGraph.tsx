import React, { useCallback, useEffect, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import {
  CardHeader,
  CardBody,
  MenuToggle,
  PageSection,
  Select,
  SelectList,
  SelectOption,
} from '@patternfly/react-core';

import useRequest from 'hooks/useRequest';
import { DashboardAPI } from 'api';
import ContentLoading from 'components/ContentLoading';
import type { JobGraphDay } from './shared/LineChart';
import LineChart from './shared/LineChart';
import './DashboardGraph.css';

function DashboardGraph() {
  const { t } = useLingui();
  const [isPeriodDropdownOpen, setIsPeriodDropdownOpen] = useState(false);
  const [isJobTypeDropdownOpen, setIsJobTypeDropdownOpen] = useState(false);
  const [isJobStatusDropdownOpen, setIsJobStatusDropdownOpen] = useState(false);
  const [periodSelection, setPeriodSelection] = useState('month');
  const [jobTypeSelection, setJobTypeSelection] = useState('all');
  const [jobStatusSelection, setJobStatusSelection] = useState('all');

  const periodLabelMap = {
    month: t`Past Month`,
    two_weeks: t`Past Two Weeks`,
    week: t`Past Week`,
    day: t`Past 24 Hours`,
  };

  const jobTypeLabelMap = {
    all: t`All Job Types`,
    inv_sync: t`Inventory Sync`,
    scm_update: t`SCM Update`,
    playbook_run: t`Playbook Run`,
  };

  const jobStatusLabelMap = {
    all: t`All Runs`,
    successful: t`Successful Runs`,
    failed: t`Failed Runs`,
  };

  const {
    isLoading,
    result: jobGraphData,
    request: fetchDashboardGraph,
  } = useRequest(
    useCallback(async () => {
      const { data } = await DashboardAPI.readJobGraph({
        period: periodSelection,
        job_type: jobTypeSelection,
      });
      // One entry per day, keyed by the epoch seconds the API returns.
      const newData: Record<string, JobGraphDay> = {};
      data.jobs.successful.forEach(([dateSecs, count]: [number, number]) => {
        if (!newData[dateSecs]) {
          newData[dateSecs] = { created: '' };
        }
        newData[dateSecs].successful = count;
      });
      data.jobs.failed.forEach(([dateSecs, count]: [number, number]) => {
        if (!newData[dateSecs]) {
          newData[dateSecs] = { created: '' };
        }
        newData[dateSecs].failed = count;
      });
      return Object.entries(newData).map(([dateSecs, day]) => {
        const [created] = new Date(Number(dateSecs) * 1000)
          .toISOString()
          .split('T');
        return { ...day, created: created as string };
      });
    }, [periodSelection, jobTypeSelection]),
    []
  );

  useEffect(() => {
    fetchDashboardGraph();
  }, [fetchDashboardGraph, periodSelection, jobTypeSelection]);
  if (isLoading) {
    return (
      <PageSection hasBodyWrapper={false}>
        <ContentLoading />
      </PageSection>
    );
  }

  return (
    <>
      <CardHeader className="ascender-dashboard-graph__card-header">
        <div className="ascender-dashboard-graph__card-actions">
          <Select
            isOpen={isPeriodDropdownOpen}
            onOpenChange={setIsPeriodDropdownOpen}
            onSelect={(_event, selection) => {
              setIsPeriodDropdownOpen(false);
              setPeriodSelection(selection);
            }}
            aria-label={t`Select Period`}
            className="periodSelect"
            data-ouia-component-id="dashboard-period-select"
            toggle={(toggleRef) => (
              <MenuToggle
                ref={toggleRef}
                onClick={() => setIsPeriodDropdownOpen(!isPeriodDropdownOpen)}
                isExpanded={isPeriodDropdownOpen}
              >
                {periodLabelMap[
                  periodSelection as keyof typeof periodLabelMap
                ] || t`Select Period`}
              </MenuToggle>
            )}
          >
            <SelectList>
              <SelectOption value="month">{t`Past Month`}</SelectOption>
              <SelectOption value="two_weeks">{t`Past Two Weeks`}</SelectOption>
              <SelectOption value="week">{t`Past Week`}</SelectOption>
              <SelectOption value="day">{t`Past 24 Hours`}</SelectOption>
            </SelectList>
          </Select>
          <Select
            isOpen={isJobTypeDropdownOpen}
            onOpenChange={setIsJobTypeDropdownOpen}
            onSelect={(_event, selection) => {
              setIsJobTypeDropdownOpen(false);
              setJobTypeSelection(selection);
            }}
            aria-label={t`Select Job Type`}
            className="jobTypeSelect"
            data-ouia-component-id="dashboard-job-type-select"
            toggle={(toggleRef) => (
              <MenuToggle
                ref={toggleRef}
                onClick={() => setIsJobTypeDropdownOpen(!isJobTypeDropdownOpen)}
                isExpanded={isJobTypeDropdownOpen}
              >
                {jobTypeLabelMap[
                  jobTypeSelection as keyof typeof jobTypeLabelMap
                ] || t`Select Job Type`}
              </MenuToggle>
            )}
          >
            <SelectList>
              <SelectOption value="all">{t`All Job Types`}</SelectOption>
              <SelectOption value="inv_sync">{t`Inventory Sync`}</SelectOption>
              <SelectOption value="scm_update">{t`SCM Update`}</SelectOption>
              <SelectOption value="playbook_run">
                {t`Playbook Run`}
              </SelectOption>
            </SelectList>
          </Select>
          <Select
            isOpen={isJobStatusDropdownOpen}
            onOpenChange={setIsJobStatusDropdownOpen}
            onSelect={(_event, selection) => {
              setIsJobStatusDropdownOpen(false);
              setJobStatusSelection(selection);
            }}
            aria-label={t`Select Status`}
            className="jobStatusSelect"
            toggle={(toggleRef) => (
              <MenuToggle
                ref={toggleRef}
                onClick={() =>
                  setIsJobStatusDropdownOpen(!isJobStatusDropdownOpen)
                }
                isExpanded={isJobStatusDropdownOpen}
                style={{ minWidth: '165px' }}
              >
                {jobStatusLabelMap[
                  jobStatusSelection as keyof typeof jobStatusLabelMap
                ] || t`Select Status`}
              </MenuToggle>
            )}
          >
            <SelectList>
              <SelectOption value="all">{t`All Runs`}</SelectOption>
              <SelectOption value="successful">
                {t`Successful Runs`}
              </SelectOption>
              <SelectOption value="failed">{t`Failed Runs`}</SelectOption>
            </SelectList>
          </Select>
        </div>
      </CardHeader>
      <CardBody className="ascender-dashboard-graph__card-body">
        <LineChart
          jobStatus={jobStatusSelection}
          height={220}
          id="d3-line-chart-root"
          data={jobGraphData}
        />
      </CardBody>
    </>
  );
}
export default DashboardGraph;
