import type { BreadcrumbResource } from 'types/api';
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
    '/approvals': t`Approvals`,
  });

  const updateBreadcrumbConfig = useCallback(
    (workflowApproval?: BreadcrumbResource) => {
      if (!workflowApproval) {
        return;
      }
      const { id } = workflowApproval;
      setBreadcrumbConfig({
        '/approvals': t`Approvals`,
        [`/approvals/${id}`]: workflowApproval.name,
        [`/approvals/${id}/details`]: workflowApproval.name,
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
