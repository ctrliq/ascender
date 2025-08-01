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
import { getQSConfig, parseQueryString } from 'util/qs';
import { UsersAPI, RolesAPI } from 'api';
import useRequest, { useDeleteItems } from 'hooks/useRequest';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import ErrorDetail from 'components/ErrorDetail';
import AlertModal from 'components/AlertModal';
import DatalistToolbar from 'components/DataListToolbar';
import UserAndTeamAccessAdd from 'components/UserAndTeamAccessAdd/UserAndTeamAccessAdd';
import UserRolesListItem from './UserRolesListItem';

const QS_CONFIG = getQSConfig('roles', {
  page: 1,
  page_size: 20,
  order_by: 'id',
});
// TODO Figure out how to best conduct a search of this list.
// Since we only have a role ID in the top level of each role object
// we can't really search using the normal search parameters.
function UserRolesList({ user }) {
  const { i18n } = useLingui();
  const { search } = useLocation();
  const [roleToDisassociate, setRoleToDisassociate] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [associateError, setAssociateError] = useState(null);

  const {
    isLoading,
    request: fetchRoles,
    error,
    result: {
      roleCount,
      roles,
      actions,
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
        actionsResponse,
      ] = await Promise.all([
        UsersAPI.readRoles(user.id, params),
        UsersAPI.readOptions(),
      ]);
      return {
        roleCount: count,
        roles: results,
        actions: actionsResponse.data.actions,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [user.id, search]),
    {
      roles: [],
      roleCount: 0,
      actions: {},
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
      await RolesAPI.disassociateUserRole(
        roleToDisassociate.id,
        parseInt(user.id, 10)
      );
    }, [roleToDisassociate, user.id]),
    { qsConfig: QS_CONFIG, fetchItems: fetchRoles }
  );

  const canAdd =
    actions && Object.prototype.hasOwnProperty.call(actions, 'POST');

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
          {i18n._(
            msg`System administrators have unrestricted access to all resources.`
          )}
        </EmptyStateBody>
      </EmptyState>
    );
  }
  return (
    <>
      <PaginatedTable
        contentError={error}
        hasContentLoading={isLoading || isDisassociateLoading}
        items={roles}
        itemCount={roleCount}
        pluralizedItemName={i18n._(msg`User Roles`)}
        qsConfig={QS_CONFIG}
        toolbarSearchColumns={[
          {
            name: i18n._(msg`Role`),
            key: 'role_field__icontains',
            isDefault: true,
          },
        ]}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG} isSelectable={false}>
            <HeaderCell>{i18n._(msg`Name`)}</HeaderCell>
            <HeaderCell>{i18n._(msg`Type`)}</HeaderCell>
            <HeaderCell>{i18n._(msg`Role`)}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(role, index) => (
          <UserRolesListItem
            key={role.id}
            value={role.name}
            role={role}
            detailUrl={detailUrl(role)}
            isSelected={false}
            onSelect={(item) => {
              setRoleToDisassociate(item);
            }}
            rowIndex={index}
          />
        )}
        renderToolbar={(props) => (
          <DatalistToolbar
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
      />
      {showAddModal && (
        <UserAndTeamAccessAdd
          apiModel={UsersAPI}
          onFetchData={() => {
            setShowAddModal(false);
            fetchRoles();
          }}
          title={i18n._(msg`Add user permissions`)}
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
              aria-label={i18n._(msg`Confirm disassociate`)}
              onClick={() => disassociateRole()}
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
            {i18n._(
              msg`This action will disassociate the following role from ${roleToDisassociate.summary_fields.resource_name}:`
            )}
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
export default UserRolesList;
