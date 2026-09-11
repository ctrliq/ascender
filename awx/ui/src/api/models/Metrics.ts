import Base from '../Base';
import type { Http } from '../Base';

class Metrics extends Base {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/metrics/';
  }
}
export default Metrics;
