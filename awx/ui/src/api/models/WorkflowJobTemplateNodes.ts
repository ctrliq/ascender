import Base from '../Base';
import InstanceGroupsMixin from '../mixins/InstanceGroups.mixin';
import LabelsMixin from '../mixins/Labels.mixin';
import type { Http } from '../Base';

class WorkflowJobTemplateNodes extends LabelsMixin(InstanceGroupsMixin(Base)) {
  constructor(http?: Http) {
    super(http);
    this.baseUrl = 'api/v2/workflow_job_template_nodes/';
  }

  createApprovalTemplate(id: number | string, data: unknown) {
    return this.http.post(
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
    return this.http.get(`${this.baseUrl}${id}/credentials/`);
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
