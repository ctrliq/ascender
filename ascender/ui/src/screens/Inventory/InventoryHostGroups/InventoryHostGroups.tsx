import type { Host } from 'types/api';
import React from 'react';

import { Routes, Route } from 'react-router';

import InventoryHostGroupsList from './InventoryHostGroupsList';

export interface InventoryHostGroupsProps {
  /** The host whose groups these are, handed on to the list. */
  host?: Host;
}

function InventoryHostGroups({ host }: InventoryHostGroupsProps = {}) {
  return (
    <Routes>
      <Route index element={<InventoryHostGroupsList host={host} />} />
    </Routes>
  );
}

export { InventoryHostGroups as _InventoryHostGroups };
export default InventoryHostGroups;
