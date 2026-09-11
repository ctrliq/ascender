import type { Untyped } from 'types/api';
import React from 'react';
import { Routes, Route } from 'react-router';

import InventoryHost from '../InventoryHost';
import InventoryHostAdd from '../InventoryHostAdd';
import InventoryHostList from './InventoryHostList';

export interface InventoryHostsProps {
  setBreadcrumb: Untyped;
  inventory: Untyped;
  [key: string]: unknown;
}

function InventoryHosts({ setBreadcrumb, inventory }: InventoryHostsProps) {
  return (
    <Routes>
      <Route path="add" element={<InventoryHostAdd inventory={inventory} />} />
      {/* /* so the nested <InventoryHost> route tree can match */}
      <Route
        path=":hostId/*"
        element={
          <InventoryHost setBreadcrumb={setBreadcrumb} inventory={inventory} />
        }
      />
      <Route index element={<InventoryHostList />} />
    </Routes>
  );
}

export default InventoryHosts;
