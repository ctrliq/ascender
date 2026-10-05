import type { Organization, SummaryFieldRef, User } from 'types/api';
import React, { useCallback, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { useLingui } from '@lingui/react/macro';

import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import DataListToolbar from 'components/DataListToolbar';
import DisassociateButton from 'components/DisassociateButton';
import AssociateModal from 'components/AssociateModal';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import useCachedRequest from 'hooks/useCachedRequest';
import useRequest, {
  useDeleteItems,
  useDismissableError,
} from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import { OrganizationsAPI, UsersAPI } from 'api';
import { useConfig } from 'contexts/Config';
import { getQSConfig, parseQueryString } from 'util/qs';
import type { QSParams } from 'util/qs';
import {
  canManageOrganizationMembership,
  membershipPickerParams,
} from '../shared/membership';
import UserOrganizationListItem from './UserOrganizationListItem';

const QS_CONFIG = getQSConfig('organizations', {
  page: 1,
  page_size: 20,
  order_by: 'name',
  type: 'organization',
});

/**
 * The organization's Member role, which is what this tab lists the user by:
 * the api's list of a user's organizations is the ones whose member role
 * holds them directly.
 */
function memberRoleId(organization: Organization) {
  return (
    organization.summary_fields.object_roles as Record<string, SummaryFieldRef>
  )?.member_role?.id as number;
}

/** Every role the organization has, which is what the user can hold in it. */
function organizationRoleIds(organization: Organization) {
  return Object.values(
    (organization.summary_fields.object_roles ?? {}) as Record<
      string,
      SummaryFieldRef
    >
  ).map((role) => role.id);
}

export interface UserOrganizationListProps {
  /** The user whose organizations these are, as the user's page read it. */
  user?: User;
}

function UserOrganizationList({ user }: UserOrganizationListProps) {
  const location = useLocation();
  const { me, adminOrgCount } = useConfig();
  const { id } = useParams() as { id: string };
  const { t } = useLingui();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    result: { organizations, count, searchableKeys, relatedSearchableKeys },
    error: contentError,
    isLoading,
    request: fetchOrganizations,
  } = useCachedRequest(
    ['user-organization-list', id, location.search],
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [
        {
          data: { results, count: orgCount },
        },
        actions,
      ] = await Promise.all([
        UsersAPI.readOrganizations(id, params),
        UsersAPI.readOrganizationOptions(id),
      ]);
      return {
        searchableKeys: getSearchableKeys(actions.data.actions?.GET),
        relatedSearchableKeys: (actions?.data?.related_search_fields || []).map(
          (val) => val.slice(0, -8)
        ),
        organizations: results,
        count: orgCount,
      };
    }, [id, location.search]),
    {
      organizations: [],
      count: 0,
      searchableKeys: [],
      relatedSearchableKeys: [],
    }
  );

  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected(organizations);

  /*
   * Membership here is the organization's Member role, granted through the
   * user's roles as the Teams tab does for a team's. Taking the user out takes
   * every role the user holds in the organization, Admin and Auditor as well
   * as Member, so the user is out of it rather than listed with a role left;
   * the organization itself is untouched. Only the roles the user holds are
   * asked about and taken, one request each.
   */
  const {
    isLoading: isDisassociateLoading,
    deleteItems: disassociateOrganizations,
    deletionError: disassociateError,
  } = useDeleteItems(
    useCallback(
      () =>
        Promise.all(
          selected.map(async (organization) => {
            const {
              data: { results: held },
            } = await UsersAPI.readRoles(id, {
              id__in: organizationRoleIds(organization).join(','),
              page_size: 50,
            });
            await Promise.all(
              held.map((role) => UsersAPI.disassociateRole(id, role.id))
            );
          })
        ),
      [id, selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchOrganizations,
    }
  );

  const { request: handleAssociate, error: associateError } = useRequest(
    useCallback(
      async (organizationsToAssociate: Organization[]) => {
        await Promise.all(
          organizationsToAssociate.map((organization) =>
            UsersAPI.associateRole(id, memberRoleId(organization))
          )
        );
        fetchOrganizations();
      },
      [id, fetchOrganizations]
    )
  );

  const handleDisassociate = async () => {
    await disassociateOrganizations();
    clearSelected();
  };

  const { error, dismissError } = useDismissableError(
    associateError || disassociateError
  );

  /*
   * Whether the viewer may grant this user a membership at all: a superuser,
   * or an admin of some organization who may administer the user. Each
   * organization's own delete capability, which is its admin role, then says
   * which of the listed memberships the viewer can take away.
   */
  const canManage = canManageOrganizationMembership(
    me,
    adminOrgCount as number | undefined,
    user
  );

  const fetchOrganizationsToAssociate = useCallback(
    (params: QSParams) =>
      OrganizationsAPI.read(
        membershipPickerParams(params, { not__member_role__members__id: id })
      ),
    [id]
  );

  const readOrganizationOptions = useCallback(
    () => UsersAPI.readOrganizationOptions(id),
    [id]
  );

  const addButton = (
    <ToolbarAddButton
      defaultLabel={t`Associate`}
      tooltip={t`Associate Organization`}
      key="add"
      onClick={() => setIsModalOpen(true)}
    />
  );

  return (
    <>
      <PaginatedTable
        items={organizations}
        contentError={contentError}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        hasContentLoading={isLoading || isDisassociateLoading}
        itemCount={count}
        pluralizedItemName={t`Organizations`}
        emptyContentMessage={
          canManage
            ? t`Associate the user with an organization to list it here`
            : t`Organizations this user belongs to appear here`
        }
        qsConfig={QS_CONFIG}
        clearSelected={clearSelected}
        toolbarSearchColumns={[
          { name: t`Name`, key: 'name__icontains', isDefault: true },
        ]}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG}>
            <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
            <HeaderCell>{t`Description`}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(organization, index) => (
          <UserOrganizationListItem
            key={organization.id}
            value={organization.name}
            organization={organization}
            detailUrl={`/organizations/${organization.id}/details`}
            onSelect={() => handleSelect(organization)}
            isSelected={selected.some((row) => row.id === organization.id)}
            rowIndex={index}
          />
        )}
        renderToolbar={(props) => (
          <DataListToolbar
            {...props}
            isAllSelected={isAllSelected}
            onSelectAll={selectAll}
            qsConfig={QS_CONFIG}
            additionalControls={[
              ...(canManage
                ? [
                    addButton,
                    <DisassociateButton
                      key="disassociate"
                      onDisassociate={handleDisassociate}
                      itemsToDisassociate={selected}
                      modalTitle={t`Disassociate the user from these organizations?`}
                      modalNote={t`This takes away every role the user holds in each organization, Admin and Auditor as well as Member. The organizations themselves are not deleted.`}
                    />,
                  ]
                : []),
            ]}
          />
        )}
      />
      {isModalOpen && (
        <AssociateModal
          header={t`Organizations`}
          fetchRequest={fetchOrganizationsToAssociate}
          isModalOpen={isModalOpen}
          onAssociate={handleAssociate}
          onClose={() => setIsModalOpen(false)}
          title={t`Associate Organizations`}
          optionsRequest={readOrganizationOptions}
        />
      )}
      {Boolean(error) && (
        <AlertModal
          isOpen={Boolean(error)}
          onClose={dismissError}
          title={t`Error!`}
          variant="error"
        >
          {associateError
            ? t`Failed to associate one or more organizations.`
            : t`Failed to disassociate one or more organizations.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </>
  );
}

export default UserOrganizationList;
