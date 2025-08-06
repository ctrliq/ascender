import React, { useState, useCallback } from 'react';
import { Route, Switch, useRouteMatch } from 'react-router-dom';
import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';

import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import PersistentFilters from 'components/PersistentFilters';
import WorkflowApprovalList from './WorkflowApprovalList';
import WorkflowApproval from './WorkflowApproval';

function WorkflowApprovals() {
  const match = useRouteMatch();
  const { i18n } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState({
    '/workflow_approvals': i18n._(t`Workflow Approvals`),
  });

  const updateBreadcrumbConfig = useCallback(
    (workflowApproval) => {
      if (!workflowApproval) {
        return;
      }
      const { id } = workflowApproval;
      setBreadcrumbConfig({
        '/workflow_approvals': i18n._(t`Workflow Approvals`),
        [`/workflow_approvals/${id}`]: workflowApproval.name,
        [`/workflow_approvals/${id}/details`]: i18n._(t`Details`),
      });
    },
    [i18n]
  );

  return (
    <>
      <ScreenHeader
        streamType="workflow_approval"
        breadcrumbConfig={breadcrumbConfig}
      />
      <Switch>
        <Route path={`${match.url}/:id`}>
          <WorkflowApproval setBreadcrumb={updateBreadcrumbConfig} />
        </Route>
        <Route path={`${match.url}`}>
          <PersistentFilters pageKey="workflowApprovals">
            <WorkflowApprovalList />
          </PersistentFilters>
        </Route>
      </Switch>
    </>
  );
}

export default WorkflowApprovals;
