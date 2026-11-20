import type {
  AccessApiModel,
  ApiEntity,
  SearchColumn,
  SummaryFieldRef,
} from 'types/api';
import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { RolesAPI, TeamsAPI, UsersAPI } from 'api';
import { getQSConfig, parseQueryString } from 'util/qs';
import useRequest, { useDeleteItems } from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import { useUserProfile } from 'contexts/Config';
import DisassociateButton from '../DisassociateButton';
import AddResourceRole from '../AddRole/AddResourceRole';
import AlertModal from '../AlertModal';
import DataListToolbar from '../DataListToolbar';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  getSearchableKeys,
} from '../PaginatedTable';
import DeleteRoleConfirmationModal from './DeleteRoleConfirmationModal';
import ResourceAccessListItem, {
  removableRoles,
} from './ResourceAccessListItem';
import type { AccessRecord, AccessRole } from './ResourceAccessListItem';
import ErrorDetail from '../ErrorDetail';

/**
 * How many roles a row shows, directly held and inherited alike. A row stays
 * in the list for as long as it has one, which is what decides whether taking
 * roles off leaves the page empty.
 *
 * Args:
 *   record: The user's access record on this resource.
 *
 * Returns:
 *   The number of roles the record carries.
 */
const roleCount = (record: AccessRecord): number =>
  (record.summary_fields?.direct_access?.length ?? 0) +
  (record.summary_fields?.indirect_access?.length ?? 0);

const QS_CONFIG = getQSConfig('access', {
  page: 1,
  page_size: 5,
  order_by: 'first_name',
});

export interface ResourceAccessListProps {
  apiModel: AccessApiModel;
  /** Whatever the screen is showing access to, which has an id and a type. */
  resource: ApiEntity;
  [key: string]: unknown;
}

function ResourceAccessList({ apiModel, resource }: ResourceAccessListProps) {
  const { t } = useLingui();
  const { isSuperUser } = useUserProfile();
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [deletionRecord, setDeletionRecord] = useState<AccessRecord | null>(
    null
  );
  const [deletionRole, setDeletionRole] = useState<AccessRole | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const location = useLocation();

  let canAddAdditionalControls = false;
  if (isSuperUser) {
    canAddAdditionalControls = true;
  }
  if (
    resource.type === 'credential' &&
    resource?.summary_fields?.user_capabilities?.edit &&
    resource?.organization
  ) {
    canAddAdditionalControls = true;
  }
  if (resource.type !== 'credential') {
    canAddAdditionalControls = Boolean(
      resource?.summary_fields?.user_capabilities?.edit
    );
  }

  const {
    result: {
      accessRecords,
      itemCount,
      relatedSearchableKeys,
      searchableKeys,
      organizationRoles,
    },
    error: contentError,
    isLoading,
    request: fetchAccessRecords,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [response, actionsResponse] = await Promise.all([
        apiModel.readAccessList(resource.id as number, params),
        apiModel.readAccessOptions(resource.id as number),
      ]);

      // Eventually this could be expanded to other access lists.
      // We will need to combine the role ids of all the different level
      // of resource level roles.

      let orgRoles: [string, string][] = [];
      if (location.pathname.includes('/organizations')) {
        const [
          {
            data: { results: systemAdmin },
          },
          {
            data: { results: systemAuditor },
          },
        ] = await Promise.all([
          RolesAPI.read({ singleton_name: 'system_administrator' }),
          RolesAPI.read({ singleton_name: 'system_auditor' }),
        ]);

        const objectRoles = resource.summary_fields?.object_roles as Record<
          string,
          SummaryFieldRef
        >;
        orgRoles = Object.entries(objectRoles).map(
          ([key, value]): [string, string] => {
            if (key === 'admin_role') {
              return [
                `${value.id}, ${systemAdmin[0]?.id}`,
                value.name as string,
              ];
            }
            if (key === 'auditor_role') {
              return [
                `${value.id}, ${systemAuditor[0]?.id}`,
                value.name as string,
              ];
            }
            return [`${value.id}`, value.name as string];
          }
        );
      }
      return {
        accessRecords: response.data.results,
        itemCount: response.data.count,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
        organizationRoles: orgRoles,
      };
    }, [apiModel, location, resource]),
    {
      accessRecords: [],
      itemCount: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
      organizationRoles: [],
    }
  );

  useEffect(() => {
    fetchAccessRecords();
  }, [fetchAccessRecords]);

  const {
    isLoading: isDeleteLoading,
    deleteItems: deleteRole,
    deletionError,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(() => {
      // Both are set by the role chip's close button before the modal opens.
      const role = deletionRole as AccessRole;
      if (typeof role.team_id !== 'undefined') {
        return TeamsAPI.disassociateRole(role.team_id, role.id);
      }
      return UsersAPI.disassociateRole(
        (deletionRecord as AccessRecord).id,
        role.id
      );
      /* eslint-disable-next-line react-hooks/exhaustive-deps */
    }, [deletionRole]),
    {
      qsConfig: QS_CONFIG,
      // The page empties, and so steps back one, only when its one row loses
      // its one role.
      allItemsSelected:
        accessRecords.length === 1 &&
        deletionRecord !== null &&
        roleCount(deletionRecord) === 1,
      fetchItems: fetchAccessRecords,
    }
  );

  /*
   * The toolbar's Disassociate takes each ticked user's own roles on this resource
   * off, the ones a chip would, all at once. Only a user holding one of those
   * can be ticked, and the confirmation names every role that goes.
   */
  const { selected, isAllSelected, handleSelect, selectAll, clearSelected } =
    useSelected<AccessRecord>(
      accessRecords.filter(
        (record: AccessRecord) => removableRoles(record).length > 0
      )
    );
  const {
    isLoading: isBulkRemoveLoading,
    deleteItems: removeSelectedAccess,
    deletionError: bulkRemoveError,
    clearDeletionError: clearBulkRemoveError,
  } = useDeleteItems(
    useCallback(
      () =>
        Promise.all(
          selected.flatMap((record) =>
            removableRoles(record).map((role) =>
              UsersAPI.disassociateRole(record.id, role.id)
            )
          )
        ),
      [selected]
    ),
    {
      qsConfig: QS_CONFIG,
      /*
       * Every row on the page ticked is not enough to empty it: a user who
       * keeps a team's role or an inherited one stays listed. The page steps
       * back only when every row is ticked and every role on it goes.
       */
      allItemsSelected:
        accessRecords.length > 0 &&
        accessRecords.every(
          (record: AccessRecord) =>
            selected.some((row) => row.id === record.id) &&
            removableRoles(record).length === roleCount(record)
        ),
      fetchItems: fetchAccessRecords,
    }
  );
  const handleRemoveSelected = async () => {
    await removeSelectedAccess();
    clearSelected();
  };
  const selectedToRemove = selected.map((record) => ({
    id: record.id,
    name: `${record.username ?? ''}: ${removableRoles(record)
      .map((role) => role.name)
      .join(', ')}`,
  }));

  // The resource's own roles, the only ones a chip may take off.
  const resourceRoleIds = Object.values(
    (resource.summary_fields?.object_roles ?? {}) as Record<
      string,
      SummaryFieldRef
    >
  )
    .map((role) => role?.id)
    .filter((id): id is number => typeof id === 'number');

  const toolbarSearchColumns: SearchColumn[] = [
    {
      name: t`Username`,
      key: 'username__icontains',
      isDefault: true,
    },
    {
      name: t`First Name`,
      key: 'first_name__icontains',
    },
    {
      name: t`Last Name`,
      key: 'last_name__icontains',
    },
  ];

  if (organizationRoles && organizationRoles.length > 0) {
    toolbarSearchColumns.push({
      name: t`Roles`,
      key: `or__roles__in`,
      options: organizationRoles,
    });
  }

  return (
    <>
      <PaginatedTable
        contentError={contentError}
        hasContentLoading={isLoading || isDeleteLoading || isBulkRemoveLoading}
        items={accessRecords}
        itemCount={itemCount}
        pluralizedItemName={t`Users`}
        emptyContentMessage={
          canAddAdditionalControls
            ? t`Associate a role to list it here`
            : t`Users with a role on this resource appear here`
        }
        qsConfig={QS_CONFIG}
        clearSelected={clearSelected}
        toolbarSearchColumns={toolbarSearchColumns}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        renderToolbar={(props) => (
          <DataListToolbar
            {...props}
            isAllSelected={isAllSelected}
            onSelectAll={selectAll}
            qsConfig={QS_CONFIG}
            additionalControls={[
              ...(canAddAdditionalControls
                ? [
                    <ToolbarAddButton
                      defaultLabel={t`Associate`}
                      tooltip={t`Associate Role`}
                      ouiaId="access-add-button"
                      key="add"
                      onClick={() => setShowAddModal(true)}
                    />,
                  ]
                : []),
              <DisassociateButton
                key="disassociate"
                onDisassociate={handleRemoveSelected}
                itemsToDisassociate={selectedToRemove}
                // Only users with a role the api lets this viewer remove can
                // be ticked.
                verifyCannotDisassociate={false}
                modalTitle={t`Disassociate these users' roles from this resource?`}
                modalNote={t`Only roles given to each user directly on this resource are removed. Roles held through a team or inherited from an organization stay.`}
              />,
            ]}
          />
        )}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG}>
            <HeaderCell sortKey="username">{t`Username`}</HeaderCell>
            <HeaderCell sortKey="first_name">{t`First Name`}</HeaderCell>
            <HeaderCell sortKey="last_name">{t`Last Name`}</HeaderCell>
            <HeaderCell>{t`Roles`}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(accessRecord, index) => (
          <ResourceAccessListItem
            key={accessRecord.id}
            accessRecord={accessRecord}
            resourceRoleIds={resourceRoleIds}
            onRoleDelete={(role, record) => {
              setDeletionRecord(record);
              setDeletionRole(role);
              setShowDeleteModal(true);
            }}
            rowIndex={index}
            isSelected={selected.some((row) => row.id === accessRecord.id)}
            onSelect={() => handleSelect(accessRecord)}
          />
        )}
      />
      {showAddModal && (
        <AddResourceRole
          onClose={() => setShowAddModal(false)}
          onSave={() => {
            setShowAddModal(false);
            fetchAccessRecords();
          }}
          onError={(err: unknown) => setSubmitError(err)}
          roles={resource.summary_fields?.object_roles}
          resource={resource}
        />
      )}
      {showDeleteModal && (
        <DeleteRoleConfirmationModal
          role={deletionRole as AccessRole}
          username={deletionRecord?.username}
          onCancel={() => {
            setDeletionRecord(null);
            setDeletionRole(null);
            setShowDeleteModal(false);
          }}
          onConfirm={async () => {
            await deleteRole();
            setShowDeleteModal(false);
            setDeletionRecord(null);
            setDeletionRole(null);
          }}
        />
      )}
      {submitError && (
        <AlertModal
          variant="error"
          title={t`Error!`}
          isOpen={submitError}
          onClose={() => setSubmitError(null)}
        >
          {t`Failed to associate one or more roles. Some roles may have been associated; the list now shows which.`}
          <ErrorDetail error={submitError} />
        </AlertModal>
      )}
      {Boolean(bulkRemoveError) && (
        <AlertModal
          isOpen={Boolean(bulkRemoveError)}
          variant="error"
          title={t`Error!`}
          onClose={clearBulkRemoveError}
        >
          {t`Failed to disassociate one or more roles.`}
          <ErrorDetail error={bulkRemoveError} />
        </AlertModal>
      )}
      {Boolean(deletionError) && (
        <AlertModal
          isOpen={Boolean(deletionError)}
          variant="error"
          title={t`Error!`}
          onClose={clearDeletionError}
        >
          {t`Failed to disassociate role.`}
          <ErrorDetail error={deletionError} />
        </AlertModal>
      )}
    </>
  );
}

export default ResourceAccessList;
