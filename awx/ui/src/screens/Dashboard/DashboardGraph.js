import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';

import { useLingui } from '@lingui/react/macro';
import {
	Card,
	CardHeader,
	CardBody,
	PageSection
} from '@patternfly/react-core';
import {
	Select,
	SelectVariant,
	SelectOption
} from '@patternfly/react-core/deprecated';

import useRequest from 'hooks/useRequest';
import { DashboardAPI } from 'api';
import ContentLoading from 'components/ContentLoading';
import LineChart from './shared/LineChart';

const StatusSelect = styled(Select)`
  && {
    --pf-v5-c-select__toggle--MinWidth: 165px;
  }
`;
const GraphCardHeader = styled(CardHeader)`
  margin-top: var(--pf-v5-global--spacer--lg);
`;

const GraphCardActions = styled.div`
  display: flex;
  align-items: center;
  gap: var(--pf-v5-global--spacer--sm);
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
      <PageSection>
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
            variant={SelectVariant.single}
            placeholderText={t`Select period`}
            aria-label={t`Select period`}
            typeAheadAriaLabel={t`Select period`}
            className="periodSelect"
            onToggle={(_event, val) => setIsPeriodDropdownOpen(val)}
            onSelect={(event, selection) => {
              setIsPeriodDropdownOpen(false);
              setPeriodSelection(selection);
            }}
            selections={periodSelection}
            isOpen={isPeriodDropdownOpen}
            noResultsFoundText={t`No results found`}
            ouiaId="dashboard-period-select"
          >
            <SelectOption key="month" value="month">
              {t`Past month`}
            </SelectOption>
            <SelectOption key="two_weeks" value="two_weeks">
              {t`Past two weeks`}
            </SelectOption>
            <SelectOption key="week" value="week">
              {t`Past week`}
            </SelectOption>
            <SelectOption key="day" value="day">
              {t`Past 24 hours`}
            </SelectOption>
          </Select>
          <Select
            variant={SelectVariant.single}
            placeholderText={t`Select job type`}
            aria-label={t`Select job type`}
            className="jobTypeSelect"
            onToggle={(_event, val) => setIsJobTypeDropdownOpen(val)}
            onSelect={(event, selection) => {
              setIsJobTypeDropdownOpen(false);
              setJobTypeSelection(selection);
            }}
            selections={jobTypeSelection}
            isOpen={isJobTypeDropdownOpen}
            ouiaId="dashboard-job-type-select"
          >
            <SelectOption key="all" value="all">
              {t`All job types`}
            </SelectOption>
            <SelectOption key="inv_sync" value="inv_sync">
              {t`Inventory sync`}
            </SelectOption>
            <SelectOption key="scm_update" value="scm_update">
              {t`SCM update`}
            </SelectOption>
            <SelectOption key="playbook_run" value="playbook_run">
              {t`Playbook run`}
            </SelectOption>
          </Select>
          <StatusSelect
            variant={SelectVariant.single}
            placeholderText={t`Select status`}
            aria-label={t`Select status`}
            className="jobStatusSelect"
            onToggle={(_event, val) => setIsJobStatusDropdownOpen(val)}
            onSelect={(event, selection) => {
              setIsJobStatusDropdownOpen(false);
              setJobStatusSelection(selection);
            }}
            selections={jobStatusSelection}
            isOpen={isJobStatusDropdownOpen}
          >
            <SelectOption key="all" value="all">
              {t`All jobs`}
            </SelectOption>
            <SelectOption key="successful" value="successful">
              {t`Successful jobs`}
            </SelectOption>
            <SelectOption key="failed" value="failed">
              {t`Failed jobs`}
            </SelectOption>
          </StatusSelect>
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
