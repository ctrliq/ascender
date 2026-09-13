import React from 'react';
import styled from 'styled-components';

import { useLingui } from '@lingui/react/macro';
import { Card, PageSection } from '@patternfly/react-core';

import ScreenHeader from 'components/ScreenHeader';
import SubscriptionUsageChart from './SubscriptionUsageChart';

const MainPageSection = styled(PageSection)`
  padding-top: 24px;
  padding-bottom: 0;

  & .spacer {
    margin-bottom: var(--pf-v6-global--spacer--lg);
  }
`;

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
      <MainPageSection>
        <div className="spacer">
          <Card id="dashboard-main-container">
            <SubscriptionUsageChart />
          </Card>
        </div>
      </MainPageSection>
    </>
  );
}

export default SubscriptionUsage;
