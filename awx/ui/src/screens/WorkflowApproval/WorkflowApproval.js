import React, { useEffect, useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';

import { Card, PageSection } from '@patternfly/react-core';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { Link,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation } from 'react-router';
import useRequest from 'hooks/useRequest';
import RoutedTabs from 'components/RoutedTabs';
import ContentError from 'components/ContentError';
import { WorkflowApprovalsAPI } from 'api';
import WorkflowApprovalDetail from './WorkflowApprovalDetail';

function WorkflowApproval({ setBreadcrumb }) {
  const { t } = useLingui();
  const { id: workflowApprovalId } = useParams();
  const location = useLocation();
  const {
    result: { workflowApproval },
    isLoading,
    error,
    request: fetchWorkflowApproval,
  } = useRequest(
    useCallback(async () => {
      const detail = await WorkflowApprovalsAPI.readDetail(workflowApprovalId);
      setBreadcrumb(detail.data);
      return {
        workflowApproval: detail.data,
      };
    }, [workflowApprovalId, setBreadcrumb]),
    { workflowApproval: null }
  );

  useEffect(() => {
    fetchWorkflowApproval();
  }, [fetchWorkflowApproval, location.pathname]);

  if (!isLoading && error) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={error}>
            {error.response.status === 404 && (
              <span>
                {t`Workflow Approval not found.`}{' '}
                <Link to="/workflow_approvals">
                  {t`View all Workflow Approvals.`}
                </Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  const tabs = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Workflow Approvals`}
        </>
      ),
      link: `/workflow_approvals`,
      persistentFilterKey: 'workflowApprovals',
      id: 99,
    },
    {
      name: t`Details`,
      link: `/workflow_approvals/${workflowApprovalId}/details`,
      id: 0,
    },
  ];
  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <RoutedTabs tabsArray={tabs} />
        <Routes>
          <Route index element={<Navigate to="details" replace />} />
          {workflowApproval && (
            <Route
              path="details"
              element={
                <WorkflowApprovalDetail
                  fetchWorkflowApproval={fetchWorkflowApproval}
                  workflowApproval={workflowApproval}
                />
              }
            />
          )}
          <Route
            path="*"
            element={
              !isLoading ? (
                <ContentError isNotFound>
                  {workflowApprovalId && (
                    <Link
                      to={`/workflow_approvals/${workflowApprovalId}/details`}
                    >
                      {t`View Workflow Approval Details`}
                    </Link>
                  )}
                </ContentError>
              ) : null
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default WorkflowApproval;
