import type { QSParams } from 'util/qs';
import type {
  JobEventRecord,
  OptionsResponse,
  Paginated,
  UnifiedJob,
} from '../../types/api';
import type { BaseConstructor } from '../Base';

const Runnable = <T extends BaseConstructor>(parent: T) =>
  class extends parent {
    jobEventSlug = '/events/';

    cancel(id: number | string) {
      const endpoint = `${this.baseUrl}${id}/cancel/`;

      return this.http.post<void>(endpoint);
    }

    launchUpdate(id: number | string, data?: unknown) {
      const endpoint = `${this.baseUrl}${id}/update/`;

      return this.http.post<UnifiedJob>(endpoint, data);
    }

    readLaunchUpdate(id: number | string) {
      const endpoint = `${this.baseUrl}${id}/update/`;

      return this.http.get<{ can_update: boolean }>(endpoint);
    }

    readEvents(id: number | string, params: QSParams = {}) {
      const endpoint = `${this.baseUrl}${id}${this.jobEventSlug}`;

      return this.http.get<Paginated<JobEventRecord>>(endpoint, { params });
    }

    readEventOptions(id: number | string) {
      const endpoint = `${this.baseUrl}${id}${this.jobEventSlug}`;

      return this.http.options<OptionsResponse>(endpoint);
    }

    readRelaunch(id: number | string) {
      const endpoint = `${this.baseUrl}${id}/relaunch/`;

      return this.http.get<{ retry_counts?: Record<string, number> }>(endpoint);
    }

    relaunch(id: number | string, data?: unknown) {
      const endpoint = `${this.baseUrl}${id}/relaunch/`;

      return this.http.post<UnifiedJob>(endpoint, data);
    }
  };

export default Runnable;
