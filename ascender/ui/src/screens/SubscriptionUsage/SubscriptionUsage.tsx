import React from 'react';

import { useLingui } from '@lingui/react/macro';
import { Card, PageSection } from '@patternfly/react-core';

import ScreenHeader from 'components/ScreenHeader';
import SubscriptionUsageChart from './SubscriptionUsageChart';
import './SubscriptionUsage.css';

function SubscriptionUsage() {
  const { t } = useLingui();
  return (
    <>
      <ScreenHeader
        streamType="all"
        breadcrumbConfig={{
          '/subscription_usage': t`Subscription Usage`,
        }}
      />
      <PageSection className="ascender-subscription-usage__main-page-section">
        <div className="spacer">
          <Card id="dashboard-main-container">
            <SubscriptionUsageChart />
          </Card>
        </div>
      </PageSection>
    </>
  );
}

export default SubscriptionUsage;
