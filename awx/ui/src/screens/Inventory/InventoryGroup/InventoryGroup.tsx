import type { AnyInventory, Group, SetBreadcrumb } from 'types/api';
import React, { useEffect, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import {
  Link,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
} from 'react-router';
import { CaretLeftIcon } from '@patternfly/react-icons';
import RoutedTabs from 'components/RoutedTabs';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import { InventoriesAPI } from 'api';
import InventoryGroupEdit from '../InventoryGroupEdit/InventoryGroupEdit';
import InventoryGroupDetail from '../InventoryGroupDetail/InventoryGroupDetail';
import InventoryGroupHosts from '../InventoryGroupHosts';
import InventoryRelatedGroups from '../InventoryRelatedGroups';
import { isReadOnlyInventoryType } from '../shared/utils';

export interface InventoryGroupProps {
  setBreadcrumb: SetBreadcrumb;
  inventory: AnyInventory;
  [key: string]: unknown;
}

function InventoryGroup({ setBreadcrumb, inventory }: InventoryGroupProps) {
  const { t } = useLingui();
  const [inventoryGroup, setInventoryGroup] = useState<Group | null>(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [contentError, setContentError] = useState<unknown>(null);
  const {
    id: inventoryId,
    groupId,
    inventoryType,
  } = useParams() as { id: string; groupId: string; inventoryType: string };
  const location = useLocation();

  useEffect(() => {
    const loadData = async () => {
      try {
        // Read the group through the inventory in the url rather than by its
        // own id: the api only lists the groups this inventory presents, which
        // for a federated inventory are the groups of its input inventories.
        const {
          data: { results },
        } = await InventoriesAPI.readGroups(inventoryId, { id: groupId });
        const group = results?.[0] ?? null;
        setInventoryGroup(group);
        if (group) {
          setBreadcrumb(inventory, group);
        }
      } catch (err) {
        setContentError(err);
      } finally {
        setContentLoading(false);
      }
    };

    loadData();
  }, [location.pathname, inventoryId, groupId, inventory, setBreadcrumb]);

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon aria-label={t`Back to Groups`} />
          {t`Back to Groups`}
        </>
      ),
      link: `/inventories/${inventoryType}/${inventoryId}/groups`,
      id: 99,
    },
    {
      name: t`Details`,
      link: `/inventories/${inventoryType}/${inventoryId}/groups/${inventoryGroup?.id}/details`,
      id: 0,
    },
    {
      name: t`Related Groups`,
      link: `/inventories/${inventoryType}/${inventoryId}/groups/${inventoryGroup?.id}/nested_groups`,
      id: 1,
    },
    {
      name: t`Hosts`,
      link: `/inventories/${inventoryType}/${inventoryId}/groups/${inventoryGroup?.id}/nested_hosts`,
      id: 2,
    },
  ];

  if (contentLoading) {
    return <ContentLoading />;
  }

  if (contentError) {
    return <ContentError error={contentError} />;
  }

  // The inventory-scoped list came back empty: the url names a group this
  // inventory does not present (typically a hand-edited url).
  if (!inventoryGroup) {
    return (
      <ContentError isNotFound>
        <Link to={`/inventories/${inventoryType}/${inventoryId}/groups`}>
          {t`View Inventory Groups`}
        </Link>
      </ContentError>
    );
  }

  const groupBaseUrl = `/inventories/${inventoryType}/${inventoryId}/groups/${groupId}`;
  // Groups under a constructed or federated inventory are read-only, so the
  // edit url is sent back to the details rather than mounting the form.
  const readOnly = isReadOnlyInventoryType(inventoryType);

  let showCardHeader = true;
  if (['add', 'edit'].some((name) => location.pathname.includes(name))) {
    showCardHeader = false;
  }

  return (
    <>
      {showCardHeader && <RoutedTabs tabsArray={tabsArray} />}
      <Routes>
        <Route
          index
          element={
            <Navigate
              to={`/inventories/${inventoryType}/${inventoryId}/groups/${groupId}/details`}
              replace
            />
          }
        />
        {inventoryGroup && (
          <Route
            path="edit"
            element={
              readOnly ? (
                <Navigate to={`${groupBaseUrl}/details`} replace />
              ) : (
                <InventoryGroupEdit inventoryGroup={inventoryGroup} />
              )
            }
          />
        )}
        {inventoryGroup && (
          <Route
            path="details"
            element={<InventoryGroupDetail inventoryGroup={inventoryGroup} />}
          />
        )}
        {/* /* so the nested <InventoryGroupHosts> route tree can match */}
        {inventoryGroup && (
          <Route
            path="nested_hosts/*"
            element={<InventoryGroupHosts inventoryGroup={inventoryGroup} />}
          />
        )}
        {/* /* so the nested <InventoryRelatedGroups> route tree can match */}
        {inventoryGroup && (
          <Route path="nested_groups/*" element={<InventoryRelatedGroups />} />
        )}
        <Route
          path="*"
          element={
            <ContentError>
              {inventory && (
                <Link
                  to={`/inventories/${inventoryType}/${inventory.id}/details`}
                >
                  {t`View Inventory Details`}
                </Link>
              )}
            </ContentError>
          }
        />
      </Routes>
    </>
  );
}

export { InventoryGroup as _InventoryGroup };
export default InventoryGroup;
