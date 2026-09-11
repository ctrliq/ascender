import type { QSParams } from 'util/qs';
import Base from '../Base';
import type { Http } from '../Base';

/** One sample of a metric, as the api's json rendering of prometheus gives it. */
export interface MetricSample {
  /** Which instance the sample was taken on, among other labels. */
  labels: { node?: string; [key: string]: string | undefined };
  value: number;
}

/** One metric the subsystem endpoint reports, with a sample per instance. */
export interface Metric {
  help?: string;
  help_text?: string;
  type?: string;
  samples: MetricSample[];
}

/** Every metric, keyed by its name. */
export type SubsystemMetrics = Record<string, Metric>;

class Metrics extends Base<SubsystemMetrics> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/metrics/';
  }

  // The metrics come back as one object keyed by metric name, not as a page.
  read<T = SubsystemMetrics>(params?: QSParams) {
    return this.http.get<T>(this.baseUrl, { params });
  }
}
export default Metrics;
