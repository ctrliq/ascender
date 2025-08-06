import React, { useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { t } from '@lingui/react/macro';
import { OrganizationsAPI } from 'api';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  getSearchableKeys,
} from 'components/PaginatedTable';
import { getQSConfig, parseQueryString } from 'util/qs';
import useRequest from 'hooks/useRequest';
import OrganizationTeamListItem from './OrganizationTeamListItem';

const QS_CONFIG = getQSConfig('team', {
  page: 1,
  page_size: 5,
  order_by: 'name',
});

function OrganizationTeamList({ id }) {
  const { i18n } = useLingui();
  const location = useLocation();

  const {
    result: { teams, count, relatedSearchableKeys, searchableKeys },
    error,
    isLoading,
    request: fetchTeams,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [response, actionsResponse] = await Promise.all([
        OrganizationsAPI.readTeams(id, params),
        OrganizationsAPI.readTeamsOptions(id),
      ]);
      return {
        teams: response.data.results,
        count: response.data.count,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [id, location]),
    {
      teams: [],
      count: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  return (
    <PaginatedTable
      contentError={error}
      hasContentLoading={isLoading}
      items={teams}
      itemCount={count}
      pluralizedItemName={i18n._(t`Teams`)}
      qsConfig={QS_CONFIG}
      toolbarSearchColumns={[
        {
          name: i18n._(t`Name`),
          key: 'name__icontains',
          isDefault: true,
        },
        {
          name: i18n._(t`Created by (username)`),
          key: 'created_by__username__icontains',
        },
        {
          name: i18n._(t`Modified by (username)`),
          key: 'modified_by__username__icontains',
        },
      ]}
      toolbarSearchableKeys={searchableKeys}
      toolbarRelatedSearchableKeys={relatedSearchableKeys}
      headerRow={
        <HeaderRow qsConfig={QS_CONFIG} isSelectable={false}>
          <HeaderCell sortKey="name">{i18n._(t`Name`)}</HeaderCell>
          <HeaderCell>{i18n._(t`Actions`)}</HeaderCell>
        </HeaderRow>
      }
      renderRow={(item) => (
        <OrganizationTeamListItem
          key={item.id}
          value={item.name}
          team={item}
          detailUrl={`/teams/${item.id}`}
        />
      )}
    />
  );
}

OrganizationTeamList.propTypes = {
  id: PropTypes.number.isRequired,
};

export { OrganizationTeamList as _OrganizationTeamList };
export default OrganizationTeamList;
