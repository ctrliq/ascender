import type { QSParams } from 'util/qs';
import type { OptionsResponse, Paginated, Schedule } from '../../types/api';
import type { BaseConstructor } from '../Base';

const SchedulesMixin = <T extends BaseConstructor>(parent: T) =>
  class extends parent {
    createSchedule(id: number | string, data: unknown) {
      return this.http.post<Schedule>(`${this.baseUrl}${id}/schedules/`, data);
    }

    readSchedules(id: number | string, params?: QSParams) {
      return this.http.get<Paginated<Schedule>>(
        `${this.baseUrl}${id}/schedules/`,
        { params }
      );
    }

    readScheduleOptions(id: number | string) {
      return this.http.options<OptionsResponse>(
        `${this.baseUrl}${id}/schedules/`
      );
    }
  };

export default SchedulesMixin;
