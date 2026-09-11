import type { BaseConstructor } from '../Base';

const LaunchUpdateMixin = <T extends BaseConstructor>(parent: T) =>
  class extends parent {
    launchUpdate(id: number | string, data: unknown) {
      return this.http.post(`${this.baseUrl}${id}/update/`, data);
    }

    readLaunchUpdate(id: number | string) {
      return this.http.get(`${this.baseUrl}${id}/update/`);
    }
  };

export default LaunchUpdateMixin;
