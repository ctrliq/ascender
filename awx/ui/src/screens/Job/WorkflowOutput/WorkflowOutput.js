import React, { useCallback, useEffect, useMemo, useReducer } from 'react';
import { useNavigate } from 'routerCompat';
import { useLingui } from '@lingui/react/macro';

import styled from 'styled-components';
import { CardBody as PFCardBody } from '@patternfly/react-core';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { layoutGraph } from 'components/Workflow/WorkflowUtils';
import AlertModal from 'components/AlertModal';
import ContentError from 'components/ContentError';
import ErrorDetail from 'components/ErrorDetail';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import workflowReducer, {
  initReducer,
} from 'components/Workflow/workflowReducer';
import { WorkflowJobsAPI } from 'api';
import WorkflowOutputGraph from './WorkflowOutputGraph';
import WorkflowOutputToolbar from './WorkflowOutputToolbar';
import useWsWorkflowOutput from './useWsWorkflowOutput';

const CardBody = styled(PFCardBody)`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
`;

const Wrapper = styled.div`
  display: flex;
  flex-flow: column;
  height: 100%;
  position: relative;
`;

const fetchWorkflowNodes = async (jobId, pageNo = 1, nodes = []) => {
  const { data } = await WorkflowJobsAPI.readNodes(jobId, {
    page_size: 200,
    page: pageNo,
  });

  if (data.next) {
    return fetchWorkflowNodes(jobId, pageNo + 1, nodes.concat(data.results));
  }
  return nodes.concat(data.results);
};

function WorkflowOutput({ job }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(workflowReducer, {}, initReducer);
  const { contentError, links, nodePositions, nodes } = state;

  const {
    request: deleteJob,
    isLoading: isDeleting,
    error: deleteError,
  } = useRequest(
    useCallback(async () => {
      await WorkflowJobsAPI.destroy(job.id);
      navigate('/jobs');
    }, [job.id, navigate])
  );
  const { error: dismissableDeleteError, dismissError: dismissDeleteError } =
    useDismissableError(deleteError);

  useEffect(() => {
    async function fetchData() {
      try {
        const workflowNodes = await fetchWorkflowNodes(job.id);
        dispatch({
          type: 'GENERATE_NODES_AND_LINKS',
          nodes: workflowNodes,
          startLabel: t`START`,
        });
      } catch (error) {
        dispatch({ type: 'SET_CONTENT_ERROR', value: error });
      } finally {
        dispatch({ type: 'SET_IS_LOADING', value: false });
      }
    }
    dispatch({ type: 'RESET' });
    fetchData();
  }, [job.id, t]);

  // Update positions of nodes/links
  useEffect(() => {
    if (nodes && nodes.length > 0) {
      const newNodePositions = {};
      const g = layoutGraph(nodes, links);

      g.nodes().forEach((node) => {
        newNodePositions[node] = g.node(node);
      });

      dispatch({ type: 'SET_NODE_POSITIONS', value: newNodePositions });
    }
  }, [job.id, links, nodes]);

  // The hook owns live node data (WebSocket + recovery refetch).  Feed its
  // return value directly into the context so the graph always renders the
  // latest status without waiting for a reducer dispatch round-trip.
  const liveNodes = useWsWorkflowOutput(job.id, nodes);
  const liveState = useMemo(
    () => (liveNodes !== nodes ? { ...state, nodes: liveNodes } : state),
    [state, liveNodes, nodes]
  );

  if (contentError) {
    return (
      <CardBody>
        <ContentError error={contentError} />
      </CardBody>
    );
  }

  return (
    <WorkflowStateContext.Provider value={liveState}>
      <WorkflowDispatchContext.Provider value={dispatch}>
        <CardBody>
          <Wrapper>
            <WorkflowOutputToolbar
              job={job}
              onDelete={deleteJob}
              isDeleteDisabled={isDeleting}
            />
            {nodePositions && <WorkflowOutputGraph />}
          </Wrapper>
        </CardBody>
      </WorkflowDispatchContext.Provider>
      {dismissableDeleteError && (
        <AlertModal
          isOpen={dismissableDeleteError}
          variant="error"
          title={t`Job Delete Error`}
          onClose={dismissDeleteError}
        >
          {t`Failed to delete job.`}
          <ErrorDetail error={dismissableDeleteError} />
        </AlertModal>
      )}
    </WorkflowStateContext.Provider>
  );
}

export default WorkflowOutput;
