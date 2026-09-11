import type { Inventory, Untyped } from 'types/api';
import React from 'react';
import { Routes, Route } from 'react-router';
import AdvancedInventoryHostList from './AdvancedInventoryHostList';
import AdvancedInventoryHost from '../AdvancedInventoryHost';

export interface AdvancedInventoryHostsProps {
  inventory: Inventory;
  setBreadcrumb: (resource?: Untyped, nested?: Untyped) => void;
  [key: string]: unknown;
}

function AdvancedInventoryHosts({
  inventory,
  setBreadcrumb,
}: AdvancedInventoryHostsProps) {
  return (
    <Routes>
      {/* /* so the nested <AdvancedInventoryHost> route tree can match */}
      <Route
        path=":hostId/*"
        element={
          <AdvancedInventoryHost
            setBreadcrumb={setBreadcrumb}
            inventory={inventory}
          />
        }
      />
      <Route
        index
        element={<AdvancedInventoryHostList inventory={inventory} />}
      />
    </Routes>
  );
}

export default AdvancedInventoryHosts;
