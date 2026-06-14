import React from 'react';

import { Routes, Route } from 'react-router-dom-v5-compat';
import HostGroupsList from './HostGroupsList';

function HostGroups({ host }) {
  return (
    <Routes>
      <Route index element={<HostGroupsList host={host} />} />
    </Routes>
  );
}

export { HostGroups as _HostGroups };
export default HostGroups;
