import React, { useState, useCallback } from 'react';
import { Routes, Route } from 'react-router';
import { useLingui } from '@lingui/react/macro';

import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import WorkflowApprovalList from './WorkflowApprovalList';
import WorkflowApproval from './WorkflowApproval';

function WorkflowApprovals() {
  const { t } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/workflow_approvals': t`Workflow Approvals`,
  });

  const updateBreadcrumbConfig = useCallback(
    (workflowApproval) => {
      if (!workflowApproval) {
        return;
      }
      const { id } = workflowApproval;
      setBreadcrumbConfig({
        '/workflow_approvals': t`Workflow Approvals`,
        [`/workflow_approvals/${id}`]: workflowApproval.name,
        [`/workflow_approvals/${id}/details`]: t`Details`,
      });
    },
    [t]
  );

  return (
    <>
      <ScreenHeader
        streamType="workflow_approval"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Routes>
        {/* so the nested <WorkflowApproval> route tree can match the rest */}
        <Route
          path=":id/*"
          element={<WorkflowApproval setBreadcrumb={updateBreadcrumbConfig} />}
        />
        <Route
          index
          element={
            <PersistentFilters pageKey="workflowApprovals">
              <WorkflowApprovalList />
            </PersistentFilters>
          }
        />
      </Routes>
    </>
  );
}

export default WorkflowApprovals;
