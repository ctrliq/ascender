import type { QSParams } from 'util/qs';
import type { BaseConstructor } from '../Base';

const SchedulesMixin = <T extends BaseConstructor>(parent: T) =>
  class extends parent {
    createSchedule(id: number | string, data: unknown) {
      return this.http.post(`${this.baseUrl}${id}/schedules/`, data);
    }

    readSchedules(id: number | string, params?: QSParams) {
      return this.http.get(`${this.baseUrl}${id}/schedules/`, { params });
    }

    readScheduleOptions(id: number | string) {
      return this.http.options(`${this.baseUrl}${id}/schedules/`);
    }
  };

export default SchedulesMixin;
