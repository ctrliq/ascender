import type { Host } from 'types/api';
import React from 'react';

import { Routes, Route } from 'react-router';
import ContentError from 'components/ContentError';
import HostGroupsList from './HostGroupsList';

export interface HostGroupsProps {
  host: Host;
  [key: string]: unknown;
}

function HostGroups({ host }: HostGroupsProps) {
  return (
    <Routes>
      <Route index element={<HostGroupsList host={host} />} />
      <Route path="*" element={<ContentError isNotFound />} />
    </Routes>
  );
}

export { HostGroups as _HostGroups };
export default HostGroups;
