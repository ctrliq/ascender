import type { SummaryFieldRef, WorkflowJobTemplate } from 'types/api';
import React, { useCallback, useEffect, useReducer } from 'react';
import { useNavigate } from 'react-router';
import styled from 'styled-components';
import { useLingui } from '@lingui/react/macro';

import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { getAddedAndRemoved } from 'util/lists';
import { stringIsUUID } from 'util/strings';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import { layoutGraph } from 'components/Workflow/WorkflowUtils';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import workflowReducer from 'components/Workflow/workflowReducer';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import {
  OrganizationsAPI,
  WorkflowApprovalTemplatesAPI,
  WorkflowJobTemplateNodesAPI,
  WorkflowJobTemplatesAPI,
} from 'api';
import { DeleteAllNodesModal, UnsavedChangesModal } from './Modals';
import {
  LinkAddModal,
  LinkDeleteModal,
  LinkEditModal,
} from './Modals/LinkModals';
import {
  NodeAddModal,
  NodeEditModal,
  NodeDeleteModal,
  NodeViewModal,
} from './Modals/NodeModals';
import VisualizerGraph from './VisualizerGraph';
import VisualizerStartScreen from './VisualizerStartScreen';
import VisualizerToolbar from './VisualizerToolbar';
import type {
  ApiWorkflowNode,
  NodeTemplate,
  WorkflowLink,
  WorkflowNode,
} from '../../../components/Workflow/workflowReducer';
import type { NodePositions } from '../../../components/Workflow/WorkflowUtils';

/** The links out of one node, by the node each one reaches. */
type LinkMap = Record<number, Record<number, string | undefined>>;

/**
 * A credential as a node carries it: the summary the api lists it with, plus
 * the vault id that tells two vault credentials apart.
 */
type NodeCredential = SummaryFieldRef & {
  credential_type?: number;
  vault_id?: string | null;
  inputs?: { vault_id?: string | null };
};

const CenteredContent = styled.div`
  align-items: center;
  display: flex;
  flex-flow: column;
  height: 100%;
  justify-content: center;
`;

const Wrapper = styled.div`
  display: flex;
  flex-flow: column;
  height: 100%;
`;

const replaceIdentifier = (node: WorkflowNode) => {
  if (
    stringIsUUID(node.originalNodeObject?.identifier) &&
    typeof node.identifier === 'string' &&
    node.identifier !== ''
  ) {
    return true;
  }

  if (
    !stringIsUUID(node.originalNodeObject?.identifier) &&
    node.originalNodeObject?.identifier !== node.identifier
  ) {
    return true;
  }

  return false;
};
const getAggregatedCredentials = (
  originalNodeOverride: NodeCredential[] = [],
  templateDefaultCredentials: NodeCredential[] = []
) => {
  let theArray: NodeCredential[] = [];

  const isCredentialOverriden = (templateDefaultCred: NodeCredential) => {
    let credentialHasOverride = false;
    originalNodeOverride.forEach((overrideCred) => {
      if (
        templateDefaultCred.credential_type === overrideCred.credential_type
      ) {
        if (
          (!templateDefaultCred.vault_id && !overrideCred.inputs?.vault_id) ||
          (templateDefaultCred.vault_id &&
            overrideCred.inputs?.vault_id &&
            templateDefaultCred.vault_id === overrideCred.inputs?.vault_id)
        ) {
          credentialHasOverride = true;
        }
      }
    });

    return credentialHasOverride;
  };

  if (templateDefaultCredentials.length > 0) {
    templateDefaultCredentials.forEach((defaultCred) => {
      if (!isCredentialOverriden(defaultCred)) {
        theArray.push(defaultCred);
      }
    });
  }

  theArray = theArray.concat(originalNodeOverride);

  return theArray;
};

const fetchWorkflowNodes = async (
  templateId: number,
  pageNo = 1,
  workflowNodes: ApiWorkflowNode[] = []
): Promise<ApiWorkflowNode[]> => {
  const { data } = await WorkflowJobTemplatesAPI.readNodes(templateId, {
    page_size: 200,
    page: pageNo,
  });
  if (data.next) {
    return fetchWorkflowNodes(
      templateId,
      pageNo + 1,
      workflowNodes.concat(data.results)
    );
  }
  return workflowNodes.concat(data.results);
};

export interface VisualizerProps {
  template: WorkflowJobTemplate;
  [key: string]: unknown;
}

function Visualizer({ template }: VisualizerProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(workflowReducer, {
    addLinkSourceNode: null,
    addLinkTargetNode: null,
    addNodeSource: null,
    addNodeTarget: null,
    addingLink: false,
    contentError: null,
    defaultOrganization: null,
    isLoading: true,
    linkToDelete: null,
    linkToEdit: null,
    links: [],
    nextNodeId: 0,
    nodePositions: null,
    nodeToDelete: null,
    nodeToEdit: null,
    nodeToView: null,
    nodes: [],
    showDeleteAllNodesModal: false,
    showLegend: false,
    showTools: false,
    showUnsavedChangesModal: false,
    unsavedChanges: false,
  });

  const {
    addLinkSourceNode,
    addLinkTargetNode,
    addNodeSource,
    contentError,
    defaultOrganization,
    isLoading,
    linkToDelete,
    linkToEdit,
    links,
    nodeToDelete,
    nodeToEdit,
    nodeToView,
    nodes,
    showDeleteAllNodesModal,
    showUnsavedChangesModal,
    unsavedChanges,
  } = state;

  const handleVisualizerClose = () => {
    if (unsavedChanges) {
      dispatch({ type: 'TOGGLE_UNSAVED_CHANGES_MODAL' });
    } else {
      navigate(`/templates/workflow_job_template/${template.id}/details`);
    }
  };

  const associateNodes = (
    newLinks: WorkflowLink[],
    originalLinkMap: Record<number, ApiWorkflowNode>
  ) => {
    const associateNodeRequests: Promise<unknown>[] = [];
    newLinks.forEach((link) => {
      // Every node the links run between has been posted by now, so both ends
      // have a real id to associate with.
      const sourceId = originalLinkMap[link.source.id]?.id;
      const targetId = originalLinkMap[link.target.id]?.id;
      if (sourceId === undefined || targetId === undefined) {
        return;
      }
      switch (link.linkType) {
        case 'success':
          associateNodeRequests.push(
            WorkflowJobTemplateNodesAPI.associateSuccessNode(sourceId, targetId)
          );
          break;
        case 'failure':
          associateNodeRequests.push(
            WorkflowJobTemplateNodesAPI.associateFailureNode(sourceId, targetId)
          );
          break;
        case 'always':
          associateNodeRequests.push(
            WorkflowJobTemplateNodesAPI.associateAlwaysNode(sourceId, targetId)
          );
          break;
        case 'condition':
          associateNodeRequests.push(
            WorkflowJobTemplateNodesAPI.associateConditionNode(
              sourceId,
              targetId,
              link.linkCondition
            )
          );
          break;
        default:
      }
    });

    return associateNodeRequests;
  };

  const disassociateNodes = (
    originalLinkMap: Record<number, ApiWorkflowNode>,
    deletedNodeIds: number[],
    linkMap: LinkMap
  ) => {
    const disassociateNodeRequests: Promise<unknown>[] = [];
    Object.values(originalLinkMap).forEach((node) => {
      const nodeLinks = linkMap[node.id];
      node.success_nodes.forEach((successNodeId) => {
        if (
          !deletedNodeIds.includes(successNodeId) &&
          nodeLinks?.[successNodeId] !== 'success'
        ) {
          disassociateNodeRequests.push(
            WorkflowJobTemplateNodesAPI.disassociateSuccessNode(
              node.id,
              successNodeId
            )
          );
        }
      });
      node.failure_nodes.forEach((failureNodeId) => {
        if (
          !deletedNodeIds.includes(failureNodeId) &&
          nodeLinks?.[failureNodeId] !== 'failure'
        ) {
          disassociateNodeRequests.push(
            WorkflowJobTemplateNodesAPI.disassociateFailuresNode(
              node.id,
              failureNodeId
            )
          );
        }
      });
      node.always_nodes.forEach((alwaysNodeId) => {
        if (
          !deletedNodeIds.includes(alwaysNodeId) &&
          nodeLinks?.[alwaysNodeId] !== 'always'
        ) {
          disassociateNodeRequests.push(
            WorkflowJobTemplateNodesAPI.disassociateAlwaysNode(
              node.id,
              alwaysNodeId
            )
          );
        }
      });
      (node.condition_nodes || []).forEach((conditionNodeId) => {
        if (
          !deletedNodeIds.includes(conditionNodeId) &&
          nodeLinks?.[conditionNodeId] !== 'condition'
        ) {
          disassociateNodeRequests.push(
            WorkflowJobTemplateNodesAPI.disassociateConditionNode(
              node.id,
              conditionNodeId
            )
          );
        }
      });
    });

    return disassociateNodeRequests;
  };

  useEffect(() => {
    async function fetchData() {
      try {
        const {
          data: { results },
        } = await OrganizationsAPI.read({ page_size: 1, page: 1 });
        dispatch({
          type: 'SET_DEFAULT_ORGANIZATION',
          value: results[0]?.id,
        });

        const workflowNodes = await fetchWorkflowNodes(template.id);
        dispatch({
          type: 'GENERATE_NODES_AND_LINKS',
          nodes: workflowNodes,
          startLabel: t`START`,
        });
      } catch (error) {
        dispatch({ type: 'SET_CONTENT_ERROR', value: error as Error });
      } finally {
        dispatch({ type: 'SET_IS_LOADING', value: false });
      }
    }
    fetchData();
  }, [template.id, t]);

  // Update positions of nodes/links
  useEffect(() => {
    if (nodes) {
      const newNodePositions: NodePositions = {};
      const nonDeletedNodes = nodes.filter((node) => !node.isDeleted);
      const g = layoutGraph(nonDeletedNodes, links);

      g.nodes().forEach((node) => {
        newNodePositions[Number(node)] = g.node(node);
      });

      dispatch({ type: 'SET_NODE_POSITIONS', value: newNodePositions });
    }
  }, [links, nodes]);

  const {
    error: saveVisualizerError,
    isLoading: isSavingVisualizer,
    request: saveVisualizer,
  } = useRequest(
    useCallback(async () => {
      const nodeRequests: Promise<unknown>[] = [];
      const approvalTemplateRequests: Promise<unknown>[] = [];
      const originalLinkMap: Record<number, ApiWorkflowNode> = {};
      const deletedNodeIds: number[] = [];
      const associateCredentialRequests: Promise<unknown>[] = [];
      const disassociateCredentialRequests: Promise<unknown>[] = [];
      const associateLabelRequests: Promise<unknown>[] = [];
      const disassociateLabelRequests: Promise<unknown>[] = [];
      const instanceGroupRequests: Promise<unknown>[] = [];

      const generateLinkMapAndNewLinks = () => {
        const linkMap: LinkMap = {};
        const newLinks: WorkflowLink[] = [];

        links.forEach((link) => {
          // Node 1 is the synthetic START node, which has no api node behind
          // it; every other link runs between two nodes the map holds.
          const sourceNode = originalLinkMap[link.source.id];
          const targetNode = originalLinkMap[link.target.id];
          if (link.source.id !== 1 && sourceNode && targetNode) {
            const realLinkSourceId = sourceNode.id;
            const realLinkTargetId = targetNode.id;
            const sourceLinks = linkMap[realLinkSourceId] ?? {};
            linkMap[realLinkSourceId] = sourceLinks;
            sourceLinks[realLinkTargetId] = link.linkType;
            switch (link.linkType) {
              case 'success':
                if (!sourceNode.success_nodes.includes(realLinkTargetId)) {
                  newLinks.push(link);
                }
                break;
              case 'failure':
                if (!sourceNode.failure_nodes.includes(realLinkTargetId)) {
                  newLinks.push(link);
                }
                break;
              case 'always':
                if (!sourceNode.always_nodes.includes(realLinkTargetId)) {
                  newLinks.push(link);
                }
                break;
              case 'condition': {
                const existingEdge = (sourceNode.condition_edges || []).find(
                  (edge) => edge.id === realLinkTargetId
                );
                // re-posting an existing condition link updates its condition,
                // so also treat links whose condition changed as new
                if (
                  !existingEdge ||
                  existingEdge.trigger !== link.linkCondition?.trigger ||
                  existingEdge.artifact_key !==
                    link.linkCondition?.artifact_key ||
                  existingEdge.operator !== link.linkCondition?.operator ||
                  existingEdge.expected_value !==
                    link.linkCondition?.expected_value
                ) {
                  newLinks.push(link);
                }
                break;
              }
              default:
            }
          }
        });

        return { linkMap, newLinks };
      };

      nodes.forEach((node) => {
        // node with id=1 is the artificial start node
        if (node.id === 1) {
          return;
        }
        if (node.originalNodeObject && !node.isDeleted) {
          const {
            id,
            success_nodes,
            failure_nodes,
            always_nodes,
            condition_nodes,
            condition_edges,
          } = node.originalNodeObject;
          originalLinkMap[node.id] = {
            id,
            success_nodes,
            failure_nodes,
            always_nodes,
            condition_nodes: condition_nodes || [],
            condition_edges: condition_edges || [],
          };
        }
        if (node.isDeleted && node.originalNodeObject) {
          deletedNodeIds.push(node.originalNodeObject.id);
          nodeRequests.push(
            WorkflowJobTemplateNodesAPI.destroy(node.originalNodeObject.id)
          );
        } else if (!node.isDeleted && !node.originalNodeObject) {
          // A node that has not been posted yet is one the modal just made, so
          // it carries the template it was made from.
          const nodeTemplate = node.fullUnifiedJobTemplate as NodeTemplate;
          if (nodeTemplate.type === 'workflow_approval_template') {
            nodeRequests.push(
              WorkflowJobTemplatesAPI.createNode(template.id, {
                all_parents_must_converge: node.all_parents_must_converge,
                ...(node.identifier && { identifier: node.identifier }),
              }).then(({ data }) => {
                node.originalNodeObject = data;
                originalLinkMap[node.id] = {
                  id: data.id,
                  success_nodes: [],
                  failure_nodes: [],
                  always_nodes: [],
                  condition_nodes: [],
                  condition_edges: [],
                };
                approvalTemplateRequests.push(
                  WorkflowJobTemplateNodesAPI.createApprovalTemplate(data.id, {
                    name: nodeTemplate.name,
                    description: nodeTemplate.description,
                    timeout: nodeTemplate.timeout,
                    context_template: nodeTemplate.context_template || '',
                    required_approvals: nodeTemplate.required_approvals || 1,
                    on_timeout: nodeTemplate.on_timeout || 'deny',
                  })
                );
              })
            );
          } else {
            nodeRequests.push(
              WorkflowJobTemplatesAPI.createNode(template.id, {
                ...node.promptValues,
                execution_environment:
                  node.promptValues?.execution_environment?.id || null,
                inventory: node.promptValues?.inventory?.id || null,
                unified_job_template: nodeTemplate.id,
                all_parents_must_converge: node.all_parents_must_converge,
                max_retries: node.max_retries || 0,
                identifier: node.identifier || undefined,
              }).then(({ data }) => {
                node.originalNodeObject = data;
                originalLinkMap[node.id] = {
                  id: data.id,
                  success_nodes: [],
                  failure_nodes: [],
                  always_nodes: [],
                  condition_nodes: [],
                  condition_edges: [],
                };

                if (node.promptValues?.addedCredentials?.length) {
                  node.promptValues.addedCredentials.forEach(
                    (cred: SummaryFieldRef) => {
                      associateCredentialRequests.push(
                        WorkflowJobTemplateNodesAPI.associateCredentials(
                          data.id,
                          cred.id
                        )
                      );
                    }
                  );
                }

                if (node.promptValues?.labels?.length) {
                  node.promptValues.labels.forEach((label) => {
                    associateLabelRequests.push(
                      WorkflowJobTemplateNodesAPI.associateLabel(
                        data.id,
                        label,
                        nodeTemplate.organization || defaultOrganization
                      )
                    );
                  });
                }
                if (node.promptValues?.instance_groups?.length)
                  /* eslint-disable no-restricted-syntax */
                  for (const group of node.promptValues.instance_groups) {
                    instanceGroupRequests.push(
                      WorkflowJobTemplateNodesAPI.associateInstanceGroup(
                        data.id,
                        group.id
                      )
                    );
                  }
              })
            );
          }
        } else if (node.isEdited) {
          // An edited node carries whatever the modal left on it, which is
          // the template it now runs.
          const nodeTemplate = node.fullUnifiedJobTemplate as NodeTemplate;
          if (nodeTemplate.type === 'workflow_approval_template') {
            if (
              node.originalNodeObject?.summary_fields?.unified_job_template
                ?.unified_job_type === 'workflow_approval'
            ) {
              nodeRequests.push(
                WorkflowJobTemplateNodesAPI.update(
                  node.originalNodeObject?.id as number,
                  {
                    all_parents_must_converge: node.all_parents_must_converge,
                    ...(replaceIdentifier(node) && {
                      identifier: node.identifier,
                    }),
                  }
                ).then(({ data }) => {
                  node.originalNodeObject = data;
                  approvalTemplateRequests.push(
                    WorkflowApprovalTemplatesAPI.update(
                      node.originalNodeObject?.summary_fields
                        ?.unified_job_template?.id as number,
                      {
                        name: nodeTemplate.name,
                        description: nodeTemplate.description,
                        timeout: nodeTemplate.timeout,
                        context_template: nodeTemplate.context_template || '',
                        required_approvals:
                          nodeTemplate.required_approvals || 1,
                        on_timeout: nodeTemplate.on_timeout || 'deny',
                      }
                    )
                  );
                })
              );
            } else {
              nodeRequests.push(
                WorkflowJobTemplateNodesAPI.update(
                  node.originalNodeObject?.id as number,
                  {
                    all_parents_must_converge: node.all_parents_must_converge,
                    ...(replaceIdentifier(node) && {
                      identifier: node.identifier,
                    }),
                  }
                ).then(({ data }) => {
                  node.originalNodeObject = data;
                  approvalTemplateRequests.push(
                    WorkflowJobTemplateNodesAPI.createApprovalTemplate(
                      node.originalNodeObject?.id as number,
                      {
                        name: nodeTemplate.name,
                        description: nodeTemplate.description,
                        timeout: nodeTemplate.timeout,
                        context_template: nodeTemplate.context_template || '',
                        required_approvals:
                          nodeTemplate.required_approvals || 1,
                        on_timeout: nodeTemplate.on_timeout || 'deny',
                      }
                    )
                  );
                })
              );
            }
          } else {
            nodeRequests.push(
              WorkflowJobTemplateNodesAPI.update(
                node.originalNodeObject?.id as number,
                {
                  ...node.promptValues,
                  execution_environment:
                    node.promptValues?.execution_environment?.id || null,
                  inventory: node.promptValues?.inventory?.id || null,
                  unified_job_template: nodeTemplate.id,
                  all_parents_must_converge: node.all_parents_must_converge,
                  max_retries: node.max_retries || 0,
                  ...(replaceIdentifier(node) && {
                    identifier: node.identifier,
                  }),
                }
              ).then(() => {
                const { added: addedCredentials, removed: removedCredentials } =
                  getAddedAndRemoved(
                    getAggregatedCredentials(
                      node?.originalNodeCredentials,
                      node.launchConfig?.defaults?.credentials
                    ),
                    node.promptValues?.credentials
                  );

                const { added: addedLabels, removed: removedLabels } =
                  getAddedAndRemoved(
                    node?.originalNodeLabels,
                    node.promptValues?.labels
                  );

                if (addedCredentials.length > 0) {
                  addedCredentials.forEach((cred) => {
                    associateCredentialRequests.push(
                      WorkflowJobTemplateNodesAPI.associateCredentials(
                        node.originalNodeObject?.id as number,
                        cred.id
                      )
                    );
                  });
                }
                if (removedCredentials?.length > 0) {
                  removedCredentials.forEach((cred) =>
                    disassociateCredentialRequests.push(
                      WorkflowJobTemplateNodesAPI.disassociateCredentials(
                        node.originalNodeObject?.id as number,
                        cred.id
                      )
                    )
                  );
                }

                if (addedLabels.length > 0) {
                  addedLabels.forEach((label) => {
                    associateLabelRequests.push(
                      WorkflowJobTemplateNodesAPI.associateLabel(
                        node.originalNodeObject?.id as number,
                        label,
                        nodeTemplate.organization || defaultOrganization
                      )
                    );
                  });
                }
                if (removedLabels?.length > 0) {
                  removedLabels.forEach((label) =>
                    disassociateLabelRequests.push(
                      WorkflowJobTemplateNodesAPI.disassociateLabel(
                        node.originalNodeObject?.id as number,
                        label as { id: number }
                      )
                    )
                  );
                }

                if (node.promptValues?.instance_groups) {
                  instanceGroupRequests.push(
                    WorkflowJobTemplateNodesAPI.orderInstanceGroups(
                      node.originalNodeObject?.id as number,
                      node.promptValues?.instance_groups,
                      node?.originalNodeInstanceGroups || []
                    )
                  );
                }
              })
            );
          }
        }
      });

      await Promise.all(nodeRequests);
      // Creating approval templates needs to happen after the node has been created
      // since we reference the node in the approval template request.
      await Promise.all(approvalTemplateRequests);
      const { linkMap, newLinks } = generateLinkMapAndNewLinks();
      await Promise.all(
        disassociateNodes(originalLinkMap, deletedNodeIds, linkMap)
      );
      await Promise.all(associateNodes(newLinks, originalLinkMap));

      await Promise.all([
        ...disassociateCredentialRequests,
        ...disassociateLabelRequests,
      ]);
      await Promise.all([
        ...associateCredentialRequests,
        ...associateLabelRequests,
        ...instanceGroupRequests,
      ]);

      navigate(`/templates/workflow_job_template/${template.id}/details`);
    }, [links, nodes, navigate, defaultOrganization, template.id]),
    {}
  );

  const { error: nodeRequestError, dismissError: dismissNodeRequestError } =
    useDismissableError(saveVisualizerError);

  if (isLoading || isSavingVisualizer) {
    return (
      <CenteredContent>
        <ContentLoading />
      </CenteredContent>
    );
  }

  if (contentError) {
    return (
      <CenteredContent>
        <ContentError error={contentError} />
      </CenteredContent>
    );
  }

  const readOnly = !template?.summary_fields?.user_capabilities?.edit;
  return (
    <WorkflowStateContext.Provider value={state}>
      <WorkflowDispatchContext.Provider value={dispatch}>
        <Wrapper>
          <VisualizerToolbar
            onClose={handleVisualizerClose}
            onSave={() => saveVisualizer()}
            hasUnsavedChanges={unsavedChanges}
            template={template}
            readOnly={readOnly}
          />
          {links.length > 0 ? (
            <VisualizerGraph readOnly={readOnly} />
          ) : (
            <VisualizerStartScreen readOnly={readOnly} />
          )}
        </Wrapper>
        {nodeToDelete && <NodeDeleteModal />}
        {linkToDelete && <LinkDeleteModal />}
        {linkToEdit && <LinkEditModal />}
        {addLinkSourceNode && addLinkTargetNode && <LinkAddModal />}
        {addNodeSource && <NodeAddModal />}
        {nodeToEdit && <NodeEditModal />}
        {showUnsavedChangesModal && (
          <UnsavedChangesModal
            onExit={() =>
              navigate(
                `/templates/workflow_job_template/${template.id}/details`
              )
            }
            onSaveAndExit={() => saveVisualizer()}
          />
        )}
        {showDeleteAllNodesModal && <DeleteAllNodesModal />}
        {nodeToView && <NodeViewModal readOnly={readOnly} />}
        {Boolean(nodeRequestError) && (
          <AlertModal
            isOpen
            variant="error"
            title={t`Error saving the workflow!`}
            onClose={dismissNodeRequestError}
            aria-label={t`Error saving the workflow!`}
          >
            {t`There was an error saving the workflow.`}
            <ErrorDetail error={nodeRequestError} />
          </AlertModal>
        )}
      </WorkflowDispatchContext.Provider>
    </WorkflowStateContext.Provider>
  );
}

export default Visualizer;
