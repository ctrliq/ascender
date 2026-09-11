import type { QSParams } from 'util/qs';
import Base from '../Base';
import InstanceGroupsMixin from '../mixins/InstanceGroups.mixin';
import LabelsMixin from '../mixins/Labels.mixin';
import type { Http } from '../Base';

class Schedules extends InstanceGroupsMixin(LabelsMixin(Base)) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/schedules/';
  }

  createPreview(data: unknown) {
    return this.http.post(`${this.baseUrl}preview/`, data);
  }

  readCredentials(resourceId: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${resourceId}/credentials/`, {
      params,
    });
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
    return this.http.get(`${this.baseUrl}zoneinfo/`);
  }
}

export default Schedules;
