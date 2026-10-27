import React from 'react';

import { Routes, Route, Navigate, useParams } from 'react-router';

import InventoryGroupAdd from '../InventoryGroupAdd/InventoryGroupAdd';

import InventoryGroup from '../InventoryGroup/InventoryGroup';
import InventoryGroupsList from './InventoryGroupsList';
import { isReadOnlyInventoryType } from '../shared/utils';

function InventoryGroups({ setBreadcrumb, inventory }) {
  const { id, inventoryType } = useParams();
  // Constructed and federated inventories are read-only here, so a hand-typed
  // add url lands on the list rather than on a form the api would refuse.
  const readOnly = isReadOnlyInventoryType(inventoryType);
  return (
    <Routes>
      <Route
        path="add"
        element={
          readOnly ? (
            <Navigate
              to={`/inventories/${inventoryType}/${id}/groups`}
              replace
            />
          ) : (
            <InventoryGroupAdd
              setBreadcrumb={setBreadcrumb}
              inventory={inventory}
            />
          )
        }
      />
      {/* /* so the nested <InventoryGroup> route tree can match */}
      <Route
        path=":groupId/*"
        element={
          <InventoryGroup inventory={inventory} setBreadcrumb={setBreadcrumb} />
        }
      />
      <Route index element={<InventoryGroupsList inventory={inventory} />} />
    </Routes>
  );
}

export { InventoryGroups as _InventoryGroups };
export default InventoryGroups;
