import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import {
	Card,
	CardHeader,
	CardBody,
	CardTitle,
	Flex,
	FlexItem,
	MenuToggle,
	PageSection,
	Select,
	SelectList,
	SelectOption,

  Content,
} from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';

import useRequest from 'hooks/useRequest';
import { SubscriptionUsageAPI } from 'api';
import { useUserProfile } from 'contexts/Config';
import ContentLoading from 'components/ContentLoading';
import UsageChart from './ChartComponents/UsageChart';

const GraphCardHeader = styled(CardHeader)`
  margin-bottom: var(--pf-v6-global--spacer--lg);
`;

const ChartCardTitle = styled(CardTitle)`
  padding-right: 24px;
  font-size: 20px;
  font-weight: var(--pf-v6-c-title--m-xl--FontWeight);
`;

const CardText = styled(Content)`
  padding-right: 24px;
`;

const GraphCardActions = styled.div`
  display: flex;
  align-items: center;
  gap: var(--pf-v6-global--spacer--sm);
  margin-left: initial;
  padding-left: 0;
`;

function SubscriptionUsageChart() {
  const { t } = useLingui();
  const [isPeriodDropdownOpen, setIsPeriodDropdownOpen] = useState(false);
  const [periodSelection, setPeriodSelection] = useState('year');
  const userProfile = useUserProfile();

  const calculateDateRange = useCallback(() => {
    const today = new Date();
    let date = '';
    switch (periodSelection) {
      case 'year':
        date =
          today.getMonth() < 10
            ? `${today.getFullYear() - 1}-0${today.getMonth() + 1}-01`
            : `${today.getFullYear() - 1}-${today.getMonth() + 1}-01`;
        break;
      case 'two_years':
        date =
          today.getMonth() < 10
            ? `${today.getFullYear() - 2}-0${today.getMonth() + 1}-01`
            : `${today.getFullYear() - 2}-${today.getMonth() + 1}-01`;
        break;
      case 'three_years':
        date =
          today.getMonth() < 10
            ? `${today.getFullYear() - 3}-0${today.getMonth() + 1}-01`
            : `${today.getFullYear() - 3}-${today.getMonth() + 1}-01`;
        break;
      default:
        date =
          today.getMonth() < 10
            ? `${today.getFullYear() - 1}-0${today.getMonth() + 1}-01`
            : `${today.getFullYear() - 1}-${today.getMonth() + 1}-01`;
        break;
    }
    return date;
  }, [periodSelection]);

  const {
    isLoading,
    result: subscriptionUsageChartData,
    request: fetchSubscriptionUsageChart,
  } = useRequest(
    useCallback(async () => {
      const data =
        await SubscriptionUsageAPI.readSubscriptionUsageChart(
          calculateDateRange()
        );
      return data.data.results;
    }, [calculateDateRange]),
    []
  );

  useEffect(() => {
    fetchSubscriptionUsageChart();
  }, [fetchSubscriptionUsageChart, periodSelection]);

  if (isLoading) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentLoading />
        </Card>
      </PageSection>
    );
  }

  const periodLabelMap = {
    year: t`Past year`,
    two_years: t`Past two years`,
    three_years: t`Past three years`,
  };

  return (
    <Card>
      <Flex style={{ justifyContent: 'space-between' }}>
        <FlexItem>
          <ChartCardTitle>
            {t`Subscription Compliance`}
          </ChartCardTitle>
        </FlexItem>
        <FlexItem>
          <CardText component="small">
            {t`Last recalculation date:`}{' '}
            {userProfile.systemConfig.HOST_METRIC_SUMMARY_TASK_LAST_TS.slice(
              0,
              10
            )}
          </CardText>
        </FlexItem>
      </Flex>
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
            data-ouia-component-id="subscription-usage-period-select"
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
              <SelectOption value="year">
                {t`Past year`}
              </SelectOption>
              <SelectOption value="two_years">
                {t`Past two years`}
              </SelectOption>
              <SelectOption value="three_years">
                {t`Past three years`}
              </SelectOption>
            </SelectList>
          </Select>
        </GraphCardActions>
      </GraphCardHeader>
      <CardBody>
        <UsageChart
          period={periodSelection}
          height={600}
          id="d3-usage-line-chart-root"
          data={subscriptionUsageChartData}
        />
      </CardBody>
    </Card>
  );
}
export default SubscriptionUsageChart;
