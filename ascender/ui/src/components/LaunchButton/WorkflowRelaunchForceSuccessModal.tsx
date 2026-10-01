import React, { useCallback, useEffect, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import {
  Button,
  Checkbox,
  Content,
  ContentVariants,
  Form,
  FormGroup,
  TextArea,
} from '@patternfly/react-core';
import { Modal } from '@patternfly/react-core/deprecated';

import { WorkflowJobsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import { stringIsUUID } from 'util/strings';
import ContentError from '../ContentError';
import ContentLoading from '../ContentLoading';

/** A node of the run that failed, as the api lists it. */
interface FailedNode {
  id: number;
  identifier?: string | null;
  summary_fields?: {
    job?: { status?: string; type?: string };
    unified_job_template?: { name?: string };
  };
}

export interface WorkflowRelaunchForceSuccessModalProps {
  /** The workflow job being relaunched, read for the nodes that failed. */
  jobId: number;
  /** Given the nodes to force and why, once both have been filled in. */
  onConfirm: (forced: { nodes: number[]; reason: string }) => void;
  onCancel: () => void;
  /** Whether the run being relaunched was canceled rather than failed. */
  isCanceled?: boolean;
}

function nodeLabel(node: FailedNode) {
  const alias =
    node.identifier && !stringIsUUID(node.identifier) ? node.identifier : null;
  const name = node.summary_fields?.unified_job_template?.name;
  if (alias && name && alias !== name) {
    return `${alias} (${name})`;
  }
  return alias || name || `#${node.id}`;
}

/**
 * Asks which of the failed nodes the relaunch should carry forward as though
 * they had succeeded, and why.
 *
 * The reason is required: it stays on the forced node, next to who forced it,
 * so whoever reads the run later knows a failure was skipped on purpose.
 * Approvals are left out of the list, since forcing one would get around the
 * people asked to approve.
 */
function WorkflowRelaunchForceSuccessModal({
  jobId,
  onConfirm,
  onCancel,
  isCanceled = false,
}: WorkflowRelaunchForceSuccessModalProps) {
  const { t } = useLingui();
  const [selected, setSelected] = useState<number[]>([]);
  const [reason, setReason] = useState('');

  const {
    result: failedNodes,
    request: fetchFailedNodes,
    isLoading,
    error,
  } = useRequest(
    useCallback(async () => {
      const { data } = await WorkflowJobsAPI.readNodes(jobId, {
        job__status__in: 'failed,error,canceled',
        page_size: 200,
        order_by: 'id',
      });
      return (data.results as unknown as FailedNode[]).filter(
        (node) => node.summary_fields?.job?.type !== 'workflow_approval'
      );
    }, [jobId]),
    [] as FailedNode[]
  );

  useEffect(() => {
    fetchFailedNodes();
  }, [fetchFailedNodes]);

  useEffect(() => {
    // the usual case is a single failed node; have it ticked already
    const [only, ...others] = failedNodes;
    if (only && others.length === 0) {
      setSelected([only.id]);
    }
  }, [failedNodes]);

  const toggle = (id: number, checked: boolean) => {
    setSelected((current) =>
      checked ? [...current, id] : current.filter((n) => n !== id)
    );
  };

  const title = isCanceled
    ? t`Relaunch forcing canceled nodes as successful`
    : t`Relaunch forcing failed nodes as successful`;

  const canConfirm = selected.length > 0 && reason.trim().length > 0;

  return (
    <Modal
      isOpen
      variant="medium"
      title={title}
      aria-label={title}
      onClose={onCancel}
      ouiaId="relaunch-force-success-modal"
      actions={[
        <Button
          key="relaunch"
          variant="primary"
          aria-label={t`Relaunch`}
          ouiaId="relaunch-force-success-confirm"
          isDisabled={isLoading || Boolean(error) || !canConfirm}
          onClick={() => onConfirm({ nodes: selected, reason: reason.trim() })}
        >
          {t`Relaunch`}
        </Button>,
        <Button
          key="cancel"
          variant="link"
          aria-label={t`Cancel`}
          ouiaId="relaunch-force-success-cancel"
          onClick={onCancel}
        >
          {t`Cancel`}
        </Button>,
      ]}
    >
      {isLoading && <ContentLoading />}
      {!isLoading && Boolean(error) && <ContentError error={error} />}
      {!isLoading && !error && failedNodes.length === 0 && (
        <Content component={ContentVariants.p}>
          {t`This run has no failed nodes that can be forced. Approvals can never be forced as successful.`}
        </Content>
      )}
      {!isLoading && !error && failedNodes.length > 0 && (
        <Form>
          <Content component={ContentVariants.p}>
            {t`The nodes ticked here are not run again: the workflow carries them forward as though they had succeeded and goes on down their success paths. They stay marked as forced, together with who forced them and why.`}
          </Content>
          <FormGroup
            fieldId="relaunch-force-success-nodes"
            label={t`Nodes to force as successful`}
            isRequired
            role="group"
          >
            {failedNodes.map((node) => (
              <Checkbox
                key={node.id}
                id={`relaunch-force-success-node-${node.id}`}
                label={nodeLabel(node)}
                isChecked={selected.includes(node.id)}
                onChange={(_event, checked) => toggle(node.id, checked)}
              />
            ))}
          </FormGroup>
          <FormGroup
            fieldId="relaunch-force-success-reason"
            label={t`Reason`}
            isRequired
          >
            <TextArea
              id="relaunch-force-success-reason"
              aria-label={t`Reason`}
              value={reason}
              onChange={(_event, value) => setReason(value)}
              resizeOrientation="vertical"
              isRequired
            />
          </FormGroup>
        </Form>
      )}
    </Modal>
  );
}

export default WorkflowRelaunchForceSuccessModal;
