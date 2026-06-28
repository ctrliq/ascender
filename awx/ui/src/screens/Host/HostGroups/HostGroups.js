import React from 'react';

import { Routes, Route } from 'react-router';
import ContentError from 'components/ContentError';
import HostGroupsList from './HostGroupsList';

function HostGroups({ host }) {
  return (
    <Routes>
      <Route index element={<HostGroupsList host={host} />} />
      <Route path="*" element={<ContentError isNotFound />} />
    </Routes>
  );
}

export { HostGroups as _HostGroups };
export default HostGroups;
