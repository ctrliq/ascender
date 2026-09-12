import type { Group } from 'types/api';
import React from 'react';
import { Routes, Route } from 'react-router';
import InventoryGroupHostAdd from '../InventoryGroupHostAdd';
import InventoryGroupHostList from './InventoryGroupHostList';

export interface InventoryGroupHostsProps {
  inventoryGroup: Group;
  [key: string]: unknown;
}

function InventoryGroupHosts({ inventoryGroup }: InventoryGroupHostsProps) {
  return (
    <Routes>
      <Route
        path="add"
        element={<InventoryGroupHostAdd inventoryGroup={inventoryGroup} />}
      />
      <Route index element={<InventoryGroupHostList />} />
    </Routes>
  );
}

export default InventoryGroupHosts;
