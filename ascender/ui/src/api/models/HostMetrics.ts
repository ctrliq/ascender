import type { HostMetric } from '../../types/api';
import Base from '../Base';
import type { Http } from '../Base';

class HostMetrics extends Base<HostMetric> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/host_metrics/';
  }
}

export default HostMetrics;
