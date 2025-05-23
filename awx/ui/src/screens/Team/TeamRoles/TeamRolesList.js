import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import {
  Button,
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  Title,
} from '@patternfly/react-core';
import { CubesIcon } from '@patternfly/react-icons';
import { TeamsAPI, RolesAPI, UsersAPI } from 'api';
import useRequest, { useDeleteItems } from 'hooks/useRequest';
import DataListToolbar from 'components/DataListToolbar';
import PaginatedTable, {
  HeaderCell,
  HeaderRow,
  ToolbarAddButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import { getQSConfig, parseQueryString } from 'util/qs';
import ErrorDetail from 'components/ErrorDetail';
import AlertModal from 'components/AlertModal';
import UserAndTeamAccessAdd from 'components/UserAndTeamAccessAdd/UserAndTeamAccessAdd';
import TeamRoleListItem from './TeamRoleListItem';

const QS_CONFIG = getQSConfig('roles', {
  page: 1,
  page_size: 20,
  order_by: 'id',
});

function TeamRolesList({ me, team }) {
  const { i18n } = useLingui();
  const { search } = useLocation();
  const [roleToDisassociate, setRoleToDisassociate] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [associateError, setAssociateError] = useState(null);

  const {
    isLoading,
    request: fetchRoles,
    error: contentError,
    result: {
      roleCount,
      roles,
      isAdminOfOrg,
      relatedSearchableKeys,
      searchableKeys,
    },
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, search);
      const [
        {
          data: { results, count },
        },
        { count: orgAdminCount },
        actionsResponse,
      ] = await Promise.all([
        TeamsAPI.readRoles(team.id, params),
        UsersAPI.readAdminOfOrganizations(me.id, {
          id: team.organization,
        }),
        TeamsAPI.readRoleOptions(team.id),
      ]);
      return {
        roleCount: count,
        roles: results,
        isAdminOfOrg: orgAdminCount > 0,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [me.id, team.id, team.organization, search]),
    {
      roles: [],
      roleCount: 0,
      isAdminOfOrg: false,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const {
    isLoading: isDisassociateLoading,
    deleteItems: disassociateRole,
    deletionError: disassociationError,
    clearDeletionError: clearDisassociationError,
  } = useDeleteItems(
    useCallback(async () => {
      setRoleToDisassociate(null);
      await RolesAPI.disassociateTeamRole(
        roleToDisassociate.id,
        parseInt(team.id, 10)
      );
    }, [roleToDisassociate, team.id]),
    { qsConfig: QS_CONFIG, fetchItems: fetchRoles }
  );

  const canAdd = team?.summary_fields?.user_capabilities?.edit || isAdminOfOrg;
  const detailUrl = (role) => {
    const { resource_id, resource_type } = role.summary_fields;

    if (!role || !resource_type) {
      return null;
    }

    if (resource_type?.includes('template')) {
      return `/templates/${resource_type}/${resource_id}/details`;
    }
    if (resource_type?.includes('inventory')) {
      return `/inventories/${resource_type}/${resource_id}/details`;
    }
    return `/${resource_type}s/${resource_id}/details`;
  };

  const isSysAdmin = roles.some((role) => role.name === 'System Administrator');
  if (isSysAdmin) {
    return (
      <EmptyState variant="full">
        <EmptyStateIcon icon={CubesIcon} />
        <Title headingLevel="h5" size="lg">
          {i18n._(msg`System Administrator`)}
        </Title>
        <EmptyStateBody>
          {i18n._(msg`System administrators have unrestricted access to all resources.`)}
        </EmptyStateBody>
      </EmptyState>
    );
  }

  return (
    <>
      <PaginatedTable
        contentError={contentError}
        hasContentLoading={isLoading || isDisassociateLoading}
        items={roles}
        itemCount={roleCount}
        pluralizedItemName={i18n._(msg`Team Roles`)}
        qsConfig={QS_CONFIG}
        toolbarSearchColumns={[
          {
            name: i18n._(msg`Role`),
            key: 'role_field__icontains',
            isDefault: true,
          },
        ]}
        toolbarSortColumns={[
          {
            name: i18n._(msg`ID`),
            key: 'id',
          },
        ]}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        renderToolbar={(props) => (
          <DataListToolbar
            {...props}
            qsConfig={QS_CONFIG}
            additionalControls={[
              ...(canAdd
                ? [
                    <ToolbarAddButton
                      ouiaId="role-add-button"
                      key="add"
                      onClick={() => setShowAddModal(true)}
                    />,
                  ]
                : []),
            ]}
          />
        )}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG} isSelectable={false}>
            <HeaderCell>{i18n._(msg`Resource Name`)}</HeaderCell>
            <HeaderCell>{i18n._(msg`Type`)}</HeaderCell>
            <HeaderCell sortKey="id">{i18n._(msg`Role`)}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(role, index) => (
          <TeamRoleListItem
            key={role.id}
            role={role}
            detailUrl={detailUrl(role)}
            onDisassociate={setRoleToDisassociate}
            index={index}
          />
        )}
      />
      {showAddModal && (
        <UserAndTeamAccessAdd
          apiModel={TeamsAPI}
          onFetchData={() => {
            setShowAddModal(false);
            fetchRoles();
          }}
          title={i18n._(msg`Add team permissions`)}
          onClose={() => setShowAddModal(false)}
          onError={(err) => setAssociateError(err)}
        />
      )}
      {roleToDisassociate && (
        <AlertModal
          aria-label={i18n._(msg`Disassociate role`)}
          isOpen={roleToDisassociate}
          variant="error"
          title={i18n._(msg`Disassociate role!`)}
          onClose={() => setRoleToDisassociate(null)}
          actions={[
            <Button
              ouiaId="disassociate-confirm-button"
              key="disassociate"
              variant="danger"
              aria-label={i18n._(msg`confirm disassociate`)}
              onClick={disassociateRole}
            >
              {i18n._(msg`Disassociate`)}
            </Button>,
            <Button
              ouiaId="disassociate-cancel-button"
              key="cancel"
              variant="link"
              aria-label={i18n._(msg`Cancel`)}
              onClick={() => setRoleToDisassociate(null)}
            >
              {i18n._(msg`Cancel`)}
            </Button>,
          ]}
        >
          <div>
            {i18n._(msg`This action will disassociate the following role from ${roleToDisassociate.summary_fields.resource_name}:`)}
            <br />
            <strong>{roleToDisassociate.name}</strong>
          </div>
        </AlertModal>
      )}
      {associateError && (
        <AlertModal
          aria-label={i18n._(msg`Associate role error`)}
          isOpen={associateError}
          variant="error"
          title={i18n._(msg`Error!`)}
          onClose={() => setAssociateError(null)}
        >
          {i18n._(msg`Failed to associate role`)}
          <ErrorDetail error={associateError} />
        </AlertModal>
      )}
      {disassociationError && (
        <AlertModal
          isOpen={disassociationError}
          variant="error"
          title={i18n._(msg`Error!`)}
          onClose={clearDisassociationError}
        >
          {i18n._(msg`Failed to delete role.`)}
          <ErrorDetail error={disassociationError} />
        </AlertModal>
      )}
    </>
  );
}
export default TeamRolesList;
