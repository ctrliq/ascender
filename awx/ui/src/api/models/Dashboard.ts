import type { QSParams } from 'util/qs';
import Base from '../Base';
import type { Http } from '../Base';

/** How many of a thing there are, and how many of those are in a bad way. */
export interface DashboardCount {
  total?: number;
  failed?: number;
  /** Inventories only: how many have a source that last failed to sync. */
  inventory_failed?: number;
  /** Job templates only: the ten most recently used, for the quick links. */
  [key: string]: unknown;
}

/** The counts the dashboard's tiles are drawn from. */
export interface DashboardCounts {
  inventories?: DashboardCount;
  inventory_sources?: DashboardCount;
  groups?: DashboardCount;
  hosts?: DashboardCount;
  projects?: DashboardCount;
  organizations?: DashboardCount;
  users?: DashboardCount;
  teams?: DashboardCount;
  credentials?: DashboardCount;
  job_templates?: DashboardCount;
  [key: string]: DashboardCount | undefined;
}

/** One point of the dashboard's job chart: a day and what ran that day. */
export interface JobGraphPoint {
  jobs: {
    successful: [number, number][];
    failed: [number, number][];
  };
}

class Dashboard extends Base<DashboardCounts> {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/dashboard/';
  }

  // The dashboard answers with the counts themselves, not a page of them.
  read<T = DashboardCounts>() {
    return this.http.get<T>(this.baseUrl);
  }

  readJobGraph(params?: QSParams) {
    return this.http.get<JobGraphPoint>(`${this.baseUrl}graphs/jobs/`, {
      params,
    });
  }
}

export default Dashboard;
