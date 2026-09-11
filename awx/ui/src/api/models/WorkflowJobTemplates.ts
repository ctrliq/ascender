import type { QSParams } from 'util/qs';
import type {
  AccessListEntry,
  LaunchConfig,
  OptionsResponse,
  Paginated,
  SurveyConfig,
  WebhookKey,
  WorkflowJobTemplate,
  WorkflowJobTemplateNode,
} from '../../types/api';
import Base from '../Base';
import SchedulesMixin from '../mixins/Schedules.mixin';
import NotificationsMixin from '../mixins/Notifications.mixin';
import LabelsMixin from '../mixins/Labels.mixin';
import type { Http } from '../Base';

class WorkflowJobTemplates extends SchedulesMixin(
  NotificationsMixin(LabelsMixin(Base))
) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/workflow_job_templates/';
    this.createSchedule = this.createSchedule.bind(this);
  }

  // Reached through a mixin, which cannot carry the resource type along, so
  // the calls that answer with a workflow job template say so here.
  read<T = Paginated<WorkflowJobTemplate>>(params?: QSParams) {
    return super.read<T>(params);
  }

  readDetail<T = WorkflowJobTemplate>(id: number | string) {
    return super.readDetail<T>(id);
  }

  create<T = WorkflowJobTemplate>(data?: unknown) {
    return super.create<T>(data);
  }

  update<T = WorkflowJobTemplate>(id: number | string, data?: unknown) {
    return super.update<T>(id, data);
  }

  copy<T = WorkflowJobTemplate>(id: number | string, data?: unknown) {
    return super.copy<T>(id, data);
  }

  readWebhookKey(id: number | string) {
    return this.http.get<WebhookKey>(`${this.baseUrl}${id}/webhook_key/`);
  }

  readWorkflowJobTemplateOptions(id: number | string) {
    return this.http.options<OptionsResponse>(`${this.baseUrl}${id}/`);
  }

  updateWebhookKey(id: number | string) {
    return this.http.post<WebhookKey>(`${this.baseUrl}${id}/webhook_key/`);
  }

  associateLabel(
    id: number | string,
    label: { id: number; name: string },
    orgId: number | string
  ) {
    return this.http.post(`${this.baseUrl}${id}/labels/`, {
      name: label.name,
      organization: orgId,
    });
  }

  createNode(id: number | string, data: unknown) {
    return this.http.post<WorkflowJobTemplateNode>(
      `${this.baseUrl}${id}/workflow_nodes/`,
      data
    );
  }

  disassociateLabel(id: number | string, label: { id: number; name: string }) {
    return this.http.post(`${this.baseUrl}${id}/labels/`, {
      id: label.id,
      disassociate: true,
    });
  }

  launch(id: number | string, data: unknown) {
    return this.http.post(`${this.baseUrl}${id}/launch/`, data);
  }

  readLaunch(id: number | string) {
    return this.http.get<LaunchConfig>(`${this.baseUrl}${id}/launch/`);
  }

  readNodes(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<WorkflowJobTemplateNode>>(
      `${this.baseUrl}${id}/workflow_nodes/`,
      {
        params,
      }
    );
  }

  readAccessList(id: number | string, params?: QSParams) {
    return this.http.get<Paginated<AccessListEntry>>(
      `${this.baseUrl}${id}/access_list/`,
      {
        params,
      }
    );
  }

  readAccessOptions(id: number | string) {
    return this.http.options<OptionsResponse>(
      `${this.baseUrl}${id}/access_list/`
    );
  }

  readSurvey(id: number | string) {
    return this.http.get<SurveyConfig>(`${this.baseUrl}${id}/survey_spec/`);
  }

  updateSurvey(id: number | string, survey: unknown) {
    return this.http.post(`${this.baseUrl}${id}/survey_spec/`, survey);
  }

  destroySurvey(id: number | string) {
    return this.http.delete(`${this.baseUrl}${id}/survey_spec/`);
  }

  readNotificationTemplatesApprovals(id: number | string, params?: QSParams) {
    return this.http.get(
      `${this.baseUrl}${id}/notification_templates_approvals/`,
      {
        params,
      }
    );
  }

  associateNotificationTemplatesApprovals(
    resourceId: number | string,
    notificationId: number | string
  ) {
    return this.http.post(
      `${this.baseUrl}${resourceId}/notification_templates_approvals/`,
      {
        id: notificationId,
      }
    );
  }

  disassociateNotificationTemplatesApprovals(
    resourceId: number | string,
    notificationId: number | string
  ) {
    return this.http.post(
      `${this.baseUrl}${resourceId}/notification_templates_approvals/`,
      {
        id: notificationId,
        disassociate: true,
      }
    );
  }
}

export default WorkflowJobTemplates;
