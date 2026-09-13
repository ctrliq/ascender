//
// Modifications Copyright (c) 2023 Ctrl IQ, Inc.
//
import React, { useCallback, useEffect, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import {
  Card,
  PageSection,
  Tabs,
  Tab,
  TabTitleText,
} from '@patternfly/react-core';

import useRequest from 'hooks/useRequest';
import useTitle from 'hooks/useTitle';
import { DashboardAPI } from 'api';
import ScreenHeader from 'components/ScreenHeader';
import JobList from 'components/JobList';
import ContentLoading from 'components/ContentLoading';
import TemplateList from 'components/TemplateList';
import Count from './shared/Count';
import DashboardGraph from './DashboardGraph';
import './Dashboard.css';

function Dashboard() {
  const { t } = useLingui();
  useTitle(t`Dashboard`);
  const [activeTabId, setActiveTabId] = useState(0);

  const {
    isLoading,
    result: countData,
    request: fetchDashboardGraph,
  } = useRequest(
    useCallback(async () => {
      const { data: dataFromCount } = await DashboardAPI.read();

      return dataFromCount;
    }, []),
    {}
  );

  useEffect(() => {
    fetchDashboardGraph();
  }, [fetchDashboardGraph]);
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
      <ScreenHeader
        streamType="all"
        breadcrumbConfig={{ '/home': t`Dashboard` }}
      />
      <PageSection hasBodyWrapper={false}>
        <div className="awx-dashboard__counts">
          <Count
            link="/hosts"
            data={countData?.hosts?.total}
            label={t`Hosts`}
          />
          <Count
            failed
            link="/hosts?host.last_job_host_summary__failed=true"
            data={countData?.hosts?.failed}
            label={t`Failed hosts`}
          />
          <Count
            link="/inventories"
            data={countData?.inventories?.total}
            label={t`Inventories`}
          />
          <Count
            failed
            link="/inventories?inventory.inventory_sources_with_failures__gt=0"
            data={countData?.inventories?.inventory_failed}
            label={t`Inventory sync failures`}
          />
          <Count
            link="/projects"
            data={countData?.projects?.total}
            label={t`Projects`}
          />
          <Count
            failed
            link="/projects?project.status__in=failed,canceled"
            data={countData?.projects?.failed}
            label={t`Project sync failures`}
          />
        </div>
      </PageSection>
      <PageSection className="awx-dashboard__main-page-section">
        <div className="spacer">
          <Card id="dashboard-main-container">
            <Tabs
              aria-label={t`Tabs`}
              activeKey={activeTabId}
              onSelect={(key, eventKey) => setActiveTabId(Number(eventKey))}
              ouiaId="dashboard-tabs"
            >
              <Tab
                aria-label={t`Job status graph tab`}
                eventKey={0}
                title={<TabTitleText>{t`Job status`}</TabTitleText>}
                ouiaId="job-status-graph-tab"
              >
                <DashboardGraph />
              </Tab>
              <Tab
                aria-label={t`Recent Jobs list tab`}
                eventKey={1}
                title={<TabTitleText>{t`Recent Jobs`}</TabTitleText>}
                ouiaId="recent-jobs-list-tab"
              >
                <div>
                  {activeTabId === 1 && (
                    <JobList defaultParams={{ page_size: 5 }} />
                  )}
                </div>
              </Tab>
              <Tab
                aria-label={t`Recent Templates list tab`}
                eventKey={2}
                title={<TabTitleText>{t`Recent Templates`}</TabTitleText>}
                ouiaId="recent-templates-list-tab"
              >
                <div>
                  {activeTabId === 2 && (
                    <TemplateList defaultParams={{ page_size: 5 }} />
                  )}
                </div>
              </Tab>
            </Tabs>
          </Card>
        </div>
      </PageSection>
    </>
  );
}

export default Dashboard;
