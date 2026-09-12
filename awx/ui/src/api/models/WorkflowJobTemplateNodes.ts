import type { QSParams } from 'util/qs';
import type {
  Credential,
  Paginated,
  WorkflowApprovalTemplate,
  WorkflowJobTemplateNode,
} from '../../types/api';
import Base from '../Base';
import InstanceGroupsMixin from '../mixins/InstanceGroups.mixin';
import LabelsMixin from '../mixins/Labels.mixin';
import type { Http } from '../Base';

class WorkflowJobTemplateNodes extends LabelsMixin(InstanceGroupsMixin(Base)) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/workflow_job_template_nodes/';
  }

  // Reached through a mixin, which cannot carry the resource type along, so
  // the calls that answer with a workflow job template node say so here.
  read<T = Paginated<WorkflowJobTemplateNode>>(params?: QSParams) {
    return super.read<T>(params);
  }

  readDetail<T = WorkflowJobTemplateNode>(id: number | string) {
    return super.readDetail<T>(id);
  }

  create<T = WorkflowJobTemplateNode>(data?: unknown) {
    return super.create<T>(data);
  }

  update<T = WorkflowJobTemplateNode>(id: number | string, data?: unknown) {
    return super.update<T>(id, data);
  }

  copy<T = WorkflowJobTemplateNode>(id: number | string, data?: unknown) {
    return super.copy<T>(id, data);
  }

  createApprovalTemplate(id: number | string, data: unknown) {
    return this.http.post<WorkflowApprovalTemplate>(
      `${this.baseUrl}${id}/create_approval_template/`,
      data
    );
  }

  associateSuccessNode(id: number | string, idToAssociate: number | string) {
    return this.http.post(`${this.baseUrl}${id}/success_nodes/`, {
      id: idToAssociate,
    });
  }

  associateFailureNode(id: number | string, idToAssociate: number | string) {
    return this.http.post(`${this.baseUrl}${id}/failure_nodes/`, {
      id: idToAssociate,
    });
  }

  associateAlwaysNode(id: number | string, idToAssociate: number | string) {
    return this.http.post(`${this.baseUrl}${id}/always_nodes/`, {
      id: idToAssociate,
    });
  }

  associateConditionNode(
    id: number | string,
    idToAssociate: number | string,
    condition?: {
      trigger?: string;
      artifact_key?: string;
      operator?: string;
      expected_value?: string;
    }
  ) {
    return this.http.post(`${this.baseUrl}${id}/condition_nodes/`, {
      id: idToAssociate,
      trigger: condition?.trigger || 'success',
      artifact_key: condition?.artifact_key || '',
      operator: condition?.operator || 'eq',
      expected_value: condition?.expected_value || '',
    });
  }

  disassociateSuccessNode(id: number | string, idToDissociate: unknown) {
    return this.http.post(`${this.baseUrl}${id}/success_nodes/`, {
      id: idToDissociate,
      disassociate: true,
    });
  }

  disassociateFailuresNode(id: number | string, idToDissociate: unknown) {
    return this.http.post(`${this.baseUrl}${id}/failure_nodes/`, {
      id: idToDissociate,
      disassociate: true,
    });
  }

  disassociateAlwaysNode(id: number | string, idToDissociate: unknown) {
    return this.http.post(`${this.baseUrl}${id}/always_nodes/`, {
      id: idToDissociate,
      disassociate: true,
    });
  }

  disassociateConditionNode(id: number | string, idToDissociate: unknown) {
    return this.http.post(`${this.baseUrl}${id}/condition_nodes/`, {
      id: idToDissociate,
      disassociate: true,
    });
  }

  readCredentials(id: number | string) {
    return this.http.get<Paginated<Credential>>(
      `${this.baseUrl}${id}/credentials/`
    );
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
}

export default WorkflowJobTemplateNodes;
