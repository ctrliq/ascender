import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';

import { useLingui } from '@lingui/react/macro';
import {
	Card,
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
import LineChart from './shared/LineChart';

const GraphCardHeader = styled(CardHeader)`
  margin-top: var(--pf-v6-global--spacer--lg);
`;

const GraphCardActions = styled.div`
  display: flex;
  align-items: center;
  gap: var(--pf-v6-global--spacer--sm);
  margin-left: initial;
  padding-left: 0;
`;

function DashboardGraph() {
  const { t } = useLingui();
  const [isPeriodDropdownOpen, setIsPeriodDropdownOpen] = useState(false);
  const [isJobTypeDropdownOpen, setIsJobTypeDropdownOpen] = useState(false);
  const [isJobStatusDropdownOpen, setIsJobStatusDropdownOpen] = useState(false);
  const [periodSelection, setPeriodSelection] = useState('month');
  const [jobTypeSelection, setJobTypeSelection] = useState('all');
  const [jobStatusSelection, setJobStatusSelection] = useState('all');

  const periodLabelMap = {
    month: t`Past month`,
    two_weeks: t`Past two weeks`,
    week: t`Past week`,
    day: t`Past 24 hours`,
  };

  const jobTypeLabelMap = {
    all: t`All job types`,
    inv_sync: t`Inventory sync`,
    scm_update: t`SCM update`,
    playbook_run: t`Playbook run`,
  };

  const jobStatusLabelMap = {
    all: t`All jobs`,
    successful: t`Successful jobs`,
    failed: t`Failed jobs`,
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
      const newData = {};
      data.jobs.successful.forEach(([dateSecs, count]) => {
        if (!newData[dateSecs]) {
          newData[dateSecs] = {};
        }
        newData[dateSecs].successful = count;
      });
      data.jobs.failed.forEach(([dateSecs, count]) => {
        if (!newData[dateSecs]) {
          newData[dateSecs] = {};
        }
        newData[dateSecs].failed = count;
      });
      const jobData = Object.keys(newData).map((dateSecs) => {
        const [created] = new Date(dateSecs * 1000).toISOString().split('T');
        newData[dateSecs].created = created;
        return newData[dateSecs];
      });
      return jobData;
    }, [periodSelection, jobTypeSelection]),
    []
  );

  useEffect(() => {
    fetchDashboardGraph();
  }, [fetchDashboardGraph, periodSelection, jobTypeSelection]);
  if (isLoading) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentLoading />
        </Card>
      </PageSection>
    );
  }

  return (
    <>
      <GraphCardHeader>
        <GraphCardActions>
          <Select
            isOpen={isPeriodDropdownOpen}
            onOpenChange={setIsPeriodDropdownOpen}
            onSelect={(_event, selection) => {
              setIsPeriodDropdownOpen(false);
              setPeriodSelection(selection);
            }}
            aria-label={t`Select period`}
            className="periodSelect"
            data-ouia-component-id="dashboard-period-select"
            toggle={(toggleRef) => (
              <MenuToggle
                ref={toggleRef}
                onClick={() => setIsPeriodDropdownOpen(!isPeriodDropdownOpen)}
                isExpanded={isPeriodDropdownOpen}
              >
                {periodLabelMap[periodSelection] || t`Select period`}
              </MenuToggle>
            )}
          >
            <SelectList>
              <SelectOption value="month">
                {t`Past month`}
              </SelectOption>
              <SelectOption value="two_weeks">
                {t`Past two weeks`}
              </SelectOption>
              <SelectOption value="week">
                {t`Past week`}
              </SelectOption>
              <SelectOption value="day">
                {t`Past 24 hours`}
              </SelectOption>
            </SelectList>
          </Select>
          <Select
            isOpen={isJobTypeDropdownOpen}
            onOpenChange={setIsJobTypeDropdownOpen}
            onSelect={(_event, selection) => {
              setIsJobTypeDropdownOpen(false);
              setJobTypeSelection(selection);
            }}
            aria-label={t`Select job type`}
            className="jobTypeSelect"
            data-ouia-component-id="dashboard-job-type-select"
            toggle={(toggleRef) => (
              <MenuToggle
                ref={toggleRef}
                onClick={() => setIsJobTypeDropdownOpen(!isJobTypeDropdownOpen)}
                isExpanded={isJobTypeDropdownOpen}
              >
                {jobTypeLabelMap[jobTypeSelection] || t`Select job type`}
              </MenuToggle>
            )}
          >
            <SelectList>
              <SelectOption value="all">
                {t`All job types`}
              </SelectOption>
              <SelectOption value="inv_sync">
                {t`Inventory sync`}
              </SelectOption>
              <SelectOption value="scm_update">
                {t`SCM update`}
              </SelectOption>
              <SelectOption value="playbook_run">
                {t`Playbook run`}
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
            aria-label={t`Select status`}
            className="jobStatusSelect"
            toggle={(toggleRef) => (
              <MenuToggle
                ref={toggleRef}
                onClick={() => setIsJobStatusDropdownOpen(!isJobStatusDropdownOpen)}
                isExpanded={isJobStatusDropdownOpen}
                style={{ minWidth: '165px' }}
              >
                {jobStatusLabelMap[jobStatusSelection] || t`Select status`}
              </MenuToggle>
            )}
          >
            <SelectList>
              <SelectOption value="all">
                {t`All jobs`}
              </SelectOption>
              <SelectOption value="successful">
                {t`Successful jobs`}
              </SelectOption>
              <SelectOption value="failed">
                {t`Failed jobs`}
              </SelectOption>
            </SelectList>
          </Select>
        </GraphCardActions>
      </GraphCardHeader>
      <CardBody>
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
