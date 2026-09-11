import Base from '../Base';
import NotificationsMixin from '../mixins/Notifications.mixin';
import InstanceGroupsMixin from '../mixins/InstanceGroups.mixin';
import LabelsMixin from '../mixins/Labels.mixin';
import SchedulesMixin from '../mixins/Schedules.mixin';
import type { Http } from '../Base';
import type { QSParams } from 'util/qs';

class JobTemplates extends SchedulesMixin(
  InstanceGroupsMixin(NotificationsMixin(LabelsMixin(Base)))
) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/job_templates/';

    this.createSchedule = this.createSchedule.bind(this);
    this.launch = this.launch.bind(this);
    this.readLaunch = this.readLaunch.bind(this);
    this.associateLabel = this.associateLabel.bind(this);
    this.disassociateLabel = this.disassociateLabel.bind(this);
    this.readCredentials = this.readCredentials.bind(this);
    this.readAccessList = this.readAccessList.bind(this);
    this.readAccessOptions = this.readAccessOptions.bind(this);
    this.readWebhookKey = this.readWebhookKey.bind(this);
  }

  launch(id: number | string, data: unknown) {
    return this.http.post(`${this.baseUrl}${id}/launch/`, data);
  }

  readTemplateOptions(id: number | string) {
    return this.http.options(`${this.baseUrl}${id}/`);
  }

  readLaunch(id: number | string) {
    return this.http.get(`${this.baseUrl}${id}/launch/`);
  }

  readCredentials(id: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${id}/credentials/`, {
      params,
    });
  }

  associateCredentials(id: number | string, credentialId: number | string) {
    return this.http.post(`${this.baseUrl}${id}/credentials/`, {
      id: credentialId,
    });
  }

  disassociateCredentials(id: number | string, credentialId: number | string) {
    return this.http.post(`${this.baseUrl}${id}/credentials/`, {
      id: credentialId,
      disassociate: true,
    });
  }

  readAccessList(id: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${id}/access_list/`, {
      params,
    });
  }

  readAccessOptions(id: number | string) {
    return this.http.options(`${this.baseUrl}${id}/access_list/`);
  }

  readScheduleList(id: number | string, params?: QSParams) {
    return this.http.get(`${this.baseUrl}${id}/schedules/`, {
      params,
    });
  }

  readSurvey(id: number | string) {
    return this.http.get(`${this.baseUrl}${id}/survey_spec/`);
  }

  updateSurvey(id: number | string, survey: unknown) {
    return this.http.post(`${this.baseUrl}${id}/survey_spec/`, survey);
  }

  destroySurvey(id: number | string) {
    return this.http.delete(`${this.baseUrl}${id}/survey_spec/`);
  }

  readWebhookKey(id: number | string) {
    return this.http.get(`${this.baseUrl}${id}/webhook_key/`);
  }

  updateWebhookKey(id: number | string) {
    return this.http.post(`${this.baseUrl}${id}/webhook_key/`);
  }
}

export default JobTemplates;
