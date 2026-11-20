import type { InstanceGroup, SetBreadcrumb } from 'types/api';
import React from 'react';
import { Routes, Route, Navigate } from 'react-router';
import InstanceList from './InstanceList';
import InstanceDetails from '../InstanceDetails';

export interface InstancesProps {
  setBreadcrumb: SetBreadcrumb;
  instanceGroup: InstanceGroup;
  /** The group a hybrid node may not leave, as the instance group read it. */
  controlPlaneName?: string;
  [key: string]: unknown;
}

function Instances({
  setBreadcrumb,
  instanceGroup,
  controlPlaneName,
}: InstancesProps) {
  return (
    <Routes>
      <Route
        index
        element={
          <InstanceList
            instanceGroup={instanceGroup}
            controlPlaneName={controlPlaneName}
          />
        }
      />
      <Route
        path=":instanceId/details"
        element={
          <InstanceDetails
            instanceGroup={instanceGroup}
            controlPlaneName={controlPlaneName}
            setBreadcrumb={setBreadcrumb}
          />
        }
      />
      <Route path=":instanceId" element={<Navigate to="details" replace />} />
    </Routes>
  );
}

export default Instances;
