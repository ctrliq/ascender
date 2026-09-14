import type { RelaunchConfig, UnifiedJob } from '../../types/api';
import type { BaseConstructor } from '../Base';

const LaunchUpdateMixin = <T extends BaseConstructor>(parent: T) =>
  class extends parent {
    launchUpdate(id: number | string, data?: unknown) {
      return this.http.post<UnifiedJob>(`${this.baseUrl}${id}/update/`, data);
    }

    readLaunchUpdate(id: number | string) {
      return this.http.get<RelaunchConfig>(`${this.baseUrl}${id}/update/`);
    }
  };

export default LaunchUpdateMixin;
