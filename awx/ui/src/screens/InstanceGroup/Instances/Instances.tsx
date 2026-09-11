import type { SetBreadcrumb, InstanceGroup } from 'types/api';
import React from 'react';
import { Routes, Route, Navigate } from 'react-router';
import InstanceList from './InstanceList';
import InstanceDetails from '../InstanceDetails';

export interface InstancesProps {
  setBreadcrumb: SetBreadcrumb;
  instanceGroup: InstanceGroup;
  [key: string]: unknown;
}

function Instances({ setBreadcrumb, instanceGroup }: InstancesProps) {
  return (
    <Routes>
      <Route index element={<InstanceList instanceGroup={instanceGroup} />} />
      <Route
        path=":instanceId/details"
        element={
          <InstanceDetails
            instanceGroup={instanceGroup}
            setBreadcrumb={setBreadcrumb}
          />
        }
      />
      <Route path=":instanceId" element={<Navigate to="details" replace />} />
    </Routes>
  );
}

export default Instances;
