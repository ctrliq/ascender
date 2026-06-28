import React from 'react';
import { Routes, Route, Navigate } from 'react-router';
import InstanceList from './InstanceList';
import InstanceDetails from '../InstanceDetails';

function Instances({ setBreadcrumb, instanceGroup }) {
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
