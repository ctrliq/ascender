import 'styled-components/macro';
import React from 'react';
import { msg, Trans } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import styled from 'styled-components';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';
import { shape } from 'prop-types';
import { secondsToHHMMSS } from 'util/dates';
import { stringIsUUID } from 'util/strings';

const GridDL = styled.dl`
  column-gap: 15px;
  display: grid;
  grid-template-columns: max-content;
  row-gap: 0px;
  dt {
    grid-column-start: 1;
  }
  dd {
    grid-column-start: 2;
  }
`;

const ResourceDeleted = styled.p`
  margin-bottom: ${(props) => (props.job ? '10px' : '0px')};
`;

const StyledExclamationTriangleIcon = styled(ExclamationTriangleIcon)`
  color: #f0ad4d;
  height: 20px;
  margin-right: 10px;
  width: 20px;
`;

function WorkflowNodeHelp({ node }) {
  const { i18n } = useLingui();
  let nodeType;
  const job = node?.originalNodeObject?.summary_fields?.job;
  const unifiedJobTemplate =
    node?.fullUnifiedJobTemplate ||
    node?.originalNodeObject?.summary_fields?.unified_job_template;
  let identifier = null;
  if (node?.identifier) {
    ({ identifier } = node);
  } else if (
    node?.originalNodeObject?.identifier &&
    !stringIsUUID(node.originalNodeObject.identifier)
  ) {
    ({
      originalNodeObject: { identifier },
    } = node);
  }
  if (unifiedJobTemplate || job) {
    const type = unifiedJobTemplate
      ? unifiedJobTemplate.unified_job_type || unifiedJobTemplate.type
      : job.type;
    switch (type) {
      case 'job_template':
      case 'job':
        nodeType = i18n._(msg`Job Template`);
        break;
      case 'workflow_job_template':
      case 'workflow_job':
        nodeType = i18n._(msg`Workflow Job Template`);
        break;
      case 'project':
      case 'project_update':
        nodeType = i18n._(msg`Project Update`);
        break;
      case 'inventory_source':
      case 'inventory_update':
        nodeType = i18n._(msg`Inventory Update`);
        break;
      case 'workflow_approval_template':
      case 'workflow_approval':
        nodeType = i18n._(msg`Workflow Approval`);
        break;
      case 'system_job_template':
      case 'system_job':
        nodeType = i18n._(msg`Management Job`);
        break;
      default:
        nodeType = '';
    }
  }

  let jobStatus;
  if (job) {
    switch (job.status) {
      case 'new':
        jobStatus = i18n._(msg`New`);
        break;
      case 'pending':
        jobStatus = i18n._(msg`Pending`);
        break;
      case 'waiting':
        jobStatus = i18n._(msg`Waiting`);
        break;
      case 'running':
        jobStatus = i18n._(msg`Running`);
        break;
      case 'successful':
        jobStatus = i18n._(msg`Successful`);
        break;
      case 'failed':
        jobStatus = i18n._(msg`Failed`);
        break;
      case 'error':
        jobStatus = i18n._(msg`Error`);
        break;
      case 'canceled':
        jobStatus = i18n._(msg`Canceled`);
        break;
      case 'never updated':
        jobStatus = i18n._(msg`Never Updated`);
        break;
      case 'ok':
        jobStatus = i18n._(msg`OK`);
        break;
      case 'missing':
        jobStatus = i18n._(msg`Missing`);
        break;
      case 'none':
        jobStatus = i18n._(msg`None`);
        break;
      case 'updating':
        jobStatus = i18n._(msg`Updating`);
        break;
      default:
        jobStatus = '';
    }
  }

  return (
    <>
      {!unifiedJobTemplate && (!job || job.type !== 'workflow_approval') && (
        <ResourceDeleted job={job}>
          <StyledExclamationTriangleIcon />
          <Trans>
            The resource associated with this node has been deleted.
          </Trans>
        </ResourceDeleted>
      )}
      {job && (
        <GridDL>
          {identifier && (
            <>
              <dt>
                <b>{i18n._(msg`Node Alias`)}</b>
              </dt>
              <dd id="workflow-node-help-alias">{identifier}</dd>
            </>
          )}
          <dt>
            <b>{i18n._(msg`Resource Name`)}</b>
          </dt>
          <dd id="workflow-node-help-name">
            {unifiedJobTemplate?.name || i18n._(msg`Deleted`)}
          </dd>
          <dt>
            <b>{i18n._(msg`Type`)}</b>
          </dt>
          <dd id="workflow-node-help-type">{nodeType}</dd>
          <dt>
            <b>{i18n._(msg`Job Status`)}</b>
          </dt>
          <dd id="workflow-node-help-status">{jobStatus}</dd>
          {typeof job.elapsed === 'number' && (
            <>
              <dt>
                <b>{i18n._(msg`Elapsed`)}</b>
              </dt>
              <dd id="workflow-node-help-elapsed">
                {secondsToHHMMSS(job.elapsed)}
              </dd>
            </>
          )}
        </GridDL>
      )}
      {unifiedJobTemplate && !job && (
        <GridDL>
          {identifier && (
            <>
              <dt>
                <b>{i18n._(msg`Node Alias`)}</b>
              </dt>
              <dd id="workflow-node-help-alias">{identifier}</dd>
            </>
          )}
          <dt>
            <b>{i18n._(msg`Resource Name`)}</b>
          </dt>
          <dd id="workflow-node-help-name">
            {unifiedJobTemplate?.name || i18n._(msg`Deleted`)}
          </dd>
          <dt>
            <b>{i18n._(msg`Type`)}</b>
          </dt>
          <dd id="workflow-node-help-type">{nodeType}</dd>
        </GridDL>
      )}
      {job && job.type !== 'workflow_approval' && (
        <p css="margin-top: 10px">{i18n._(msg`Click to view job details`)}</p>
      )}
    </>
  );
}

WorkflowNodeHelp.propTypes = {
  node: shape().isRequired,
};

export default WorkflowNodeHelp;
