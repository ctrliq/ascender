import React from 'react';
import { Routes, Route } from 'react-router-dom-v5-compat';
import InventoryRelatedGroupList from './InventoryRelatedGroupList';
import InventoryRelatedGroupAdd from '../InventoryRelatedGroupAdd';

function InventoryRelatedGroups() {
  return (
    <Routes>
      <Route
        path="add"
        element={<InventoryRelatedGroupAdd />}
      />
      <Route
        index
        element={<InventoryRelatedGroupList />}
      />
    </Routes>
  );
}
export default InventoryRelatedGroups;
