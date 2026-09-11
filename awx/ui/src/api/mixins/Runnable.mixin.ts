import type { BaseConstructor } from '../Base';
import type { QSParams } from 'util/qs';
const Runnable = <T extends BaseConstructor>(parent: T) =>
  class extends parent {
    jobEventSlug = '/events/';

    cancel(id: number | string) {
      const endpoint = `${this.baseUrl}${id}/cancel/`;

      return this.http.post(endpoint);
    }

    launchUpdate(id: number | string, data: unknown) {
      const endpoint = `${this.baseUrl}${id}/update/`;

      return this.http.post(endpoint, data);
    }

    readLaunchUpdate(id: number | string) {
      const endpoint = `${this.baseUrl}${id}/update/`;

      return this.http.get(endpoint);
    }

    readEvents(id: number | string, params: QSParams = {}) {
      const endpoint = `${this.baseUrl}${id}${this.jobEventSlug}`;

      return this.http.get(endpoint, { params });
    }

    readEventOptions(id: number | string) {
      const endpoint = `${this.baseUrl}${id}${this.jobEventSlug}`;

      return this.http.options(endpoint);
    }

    readRelaunch(id: number | string) {
      const endpoint = `${this.baseUrl}${id}/relaunch/`;

      return this.http.get(endpoint);
    }

    relaunch(id: number | string, data: unknown) {
      const endpoint = `${this.baseUrl}${id}/relaunch/`;

      return this.http.post(endpoint, data);
    }
  };

export default Runnable;
