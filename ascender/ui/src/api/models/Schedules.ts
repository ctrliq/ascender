import type { QSParams } from 'util/qs';
import type {
  Credential,
  Paginated,
  Schedule,
  SchedulePreview,
  TimeZones,
} from '../../types/api';
import Base from '../Base';
import InstanceGroupsMixin from '../mixins/InstanceGroups.mixin';
import LabelsMixin from '../mixins/Labels.mixin';
import type { Http } from '../Base';

class Schedules extends InstanceGroupsMixin(LabelsMixin(Base)) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/schedules/';
  }

  // Reached through a mixin, which cannot carry the resource type along, so
  // the calls that answer with a schedule say so here.
  read<T = Paginated<Schedule>>(params?: QSParams) {
    return super.read<T>(params);
  }

  readDetail<T = Schedule>(id: number | string) {
    return super.readDetail<T>(id);
  }

  create<T = Schedule>(data?: unknown) {
    return super.create<T>(data);
  }

  update<T = Schedule>(id: number | string, data?: unknown) {
    return super.update<T>(id, data);
  }

  copy<T = Schedule>(id: number | string, data?: unknown) {
    return super.copy<T>(id, data);
  }

  createPreview(data: unknown) {
    return this.http.post<SchedulePreview>(`${this.baseUrl}preview/`, data);
  }

  readCredentials(resourceId: number | string, params?: QSParams) {
    return this.http.get<Paginated<Credential>>(
      `${this.baseUrl}${resourceId}/credentials/`,
      {
        params,
      }
    );
  }

  associateCredential(
    resourceId: number | string,
    credentialId: number | string
  ) {
    return this.http.post(`${this.baseUrl}${resourceId}/credentials/`, {
      id: credentialId,
    });
  }

  disassociateCredential(
    resourceId: number | string,
    credentialId: number | string
  ) {
    return this.http.post(`${this.baseUrl}${resourceId}/credentials/`, {
      id: credentialId,
      disassociate: true,
    });
  }

  readZoneInfo() {
    return this.http.get<TimeZones>(`${this.baseUrl}zoneinfo/`);
  }
}

export default Schedules;
