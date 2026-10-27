import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router';
import InventoryGroupHostAdd from '../InventoryGroupHostAdd';
import InventoryGroupHostList from './InventoryGroupHostList';
import { isReadOnlyInventoryType } from '../shared/utils';

function InventoryGroupHosts({ inventoryGroup }) {
  const { id, groupId, inventoryType } = useParams();
  // Read-only inventory types send a hand-typed add url back to the list.
  const readOnly = isReadOnlyInventoryType(inventoryType);
  return (
    <Routes>
      <Route
        path="add"
        element={
          readOnly ? (
            <Navigate
              to={`/inventories/${inventoryType}/${id}/groups/${groupId}/nested_hosts`}
              replace
            />
          ) : (
            <InventoryGroupHostAdd inventoryGroup={inventoryGroup} />
          )
        }
      />
      <Route index element={<InventoryGroupHostList />} />
    </Routes>
  );
}

export default InventoryGroupHosts;
