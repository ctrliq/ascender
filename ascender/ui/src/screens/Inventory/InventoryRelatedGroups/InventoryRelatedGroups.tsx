import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router';
import InventoryRelatedGroupList from './InventoryRelatedGroupList';
import InventoryRelatedGroupAdd from '../InventoryRelatedGroupAdd';
import { isReadOnlyInventoryType } from '../shared/utils';

function InventoryRelatedGroups() {
  const { id, groupId, inventoryType } = useParams() as {
    id: string;
    groupId: string;
    inventoryType: string;
  };
  // Read-only inventory types send a hand-typed add url back to the list.
  const readOnly = isReadOnlyInventoryType(inventoryType);
  return (
    <Routes>
      <Route
        path="add"
        element={
          readOnly ? (
            <Navigate
              to={`/inventories/${inventoryType}/${id}/groups/${groupId}/nested_groups`}
              replace
            />
          ) : (
            <InventoryRelatedGroupAdd />
          )
        }
      />
      <Route index element={<InventoryRelatedGroupList />} />
    </Routes>
  );
}
export default InventoryRelatedGroups;
