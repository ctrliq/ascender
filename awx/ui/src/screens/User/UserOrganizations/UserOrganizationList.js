import React, { useCallback, useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';

import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  getSearchableKeys,
} from 'components/PaginatedTable';
import useRequest from 'hooks/useRequest';
import { UsersAPI } from 'api';
import { getQSConfig, parseQueryString } from 'util/qs';
import UserOrganizationListItem from './UserOrganizationListItem';

const QS_CONFIG = getQSConfig('organizations', {
  page: 1,
  page_size: 20,
  order_by: 'name',
  type: 'organization',
});

function UserOrganizationList() {
  const location = useLocation();
  const { id } = useParams();
  const { i18n } = useLingui();

  const {
    result: { organizations, count, searchableKeys, relatedSearchableKeys },
    error: contentError,
    isLoading,
    request: fetchOrgs,
  } = useRequest(
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

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  return (
    <PaginatedTable
      items={organizations}
      contentError={contentError}
      toolbarSearchableKeys={searchableKeys}
      toolbarRelatedSearchableKeys={relatedSearchableKeys}
      hasContentLoading={isLoading}
      itemCount={count}
      pluralizedItemName={i18n._(msg`Organizations`)}
      qsConfig={QS_CONFIG}
      toolbarSearchColumns={[
        { name: i18n._(msg`Name`), key: 'name__icontains', isDefault: true },
      ]}
      headerRow={
        <HeaderRow qsConfig={QS_CONFIG} isSelectable={false}>
          <HeaderCell sortKey="name">{i18n._(msg`Name`)}</HeaderCell>
          <HeaderCell>{i18n._(msg`Description`)}</HeaderCell>
        </HeaderRow>
      }
      renderRow={(organization, index) => (
        <UserOrganizationListItem
          key={organization.id}
          value={organization.name}
          organization={organization}
          detailUrl={`/organizations/${organization.id}/details`}
          onSelect={() => {}}
          isSelected={false}
          rowIndex={index}
        />
      )}
    />
  );
}

export default UserOrganizationList;
