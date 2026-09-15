import type { HostMetricSummaryMonthly, Paginated } from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class SubscriptionUsage extends Base<HostMetricSummaryMonthly> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/host_metric_summary_monthly/';
  }

  readSubscriptionUsageChart(dateRange: unknown) {
    return this.http.get<Paginated<HostMetricSummaryMonthly>>(
      `${this.baseUrl}?date__gte=${dateRange}&order_by=date&page_size=100`
    );
  }
}

export default SubscriptionUsage;
