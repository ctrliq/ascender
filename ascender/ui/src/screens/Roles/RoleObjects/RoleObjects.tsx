import type { Role } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { Td, Tr } from '@patternfly/react-table';
import { useLingui } from '@lingui/react/macro';
import DataListToolbar from 'components/DataListToolbar';
import PaginatedTable, {
  HeaderCell,
  HeaderRow,
  getSearchableKeys,
} from 'components/PaginatedTable';
import useRequest from 'hooks/useRequest';
import { getQSConfig, parseQueryString } from 'util/qs';
import roleResourceUrl from 'util/roles';
import { roleType, typeLabel } from '../roleTypes';
import './RoleObjects.css';

const qsConfig = getQSConfig(
  'granted',
  { page: 1, page_size: 20, order_by: 'name' },
  []
);

/** What a kind's own endpoint returns, of which this tab reads three fields. */
interface CarryingObject {
  id: number;
  type?: string;
  name?: string;
  summary_fields?: { organization?: { name?: string } };
}

/**
 * What carries the role: every object of the kind, since each one of them does.
 *
 * Read from the objects themselves rather than from their roles, because their
 * own endpoint is the one that can be searched, ordered and paged: a role has
 * no name of its own to search and no way through to the object's.
 */
function RoleObjects() {
  const { t, i18n } = useLingui();
  const location = useLocation();
  const { model } = useParams() as { model: string };
  const kind = roleType(model);

  const {
    result: { objects, count, searchableKeys, relatedSearchableKeys },
    error,
    isLoading,
    request: fetchObjects,
  } = useRequest(
    useCallback(async () => {
      if (!kind?.api) {
        return {
          objects: [] as CarryingObject[],
          count: 0,
          searchableKeys: [] as ReturnType<typeof getSearchableKeys>,
          relatedSearchableKeys: [] as string[],
        };
      }
      const params = parseQueryString(qsConfig, location.search);
      const [response, options] = await Promise.all([
        kind.api.read(params),
        kind.api.readOptions(),
      ]);
      return {
        objects: response.data.results as CarryingObject[],
        count: response.data.count,
        searchableKeys: getSearchableKeys(options.data.actions?.GET),
        relatedSearchableKeys: (options.data.related_search_fields || []).map(
          (field: string) => field.slice(0, -8)
        ),
      };
    }, [kind, location.search]),
    {
      objects: [] as CarryingObject[],
      count: 0,
      searchableKeys: [] as ReturnType<typeof getSearchableKeys>,
      relatedSearchableKeys: [] as string[],
    }
  );

  useEffect(() => {
    fetchObjects();
  }, [fetchObjects]);

  return (
    <PaginatedTable
      contentError={error}
      hasContentLoading={isLoading}
      items={objects}
      itemCount={count}
      pluralizedItemName={typeLabel(i18n, model)}
      qsConfig={qsConfig}
      toolbarSearchColumns={[
        {
          name: t`Name`,
          key: 'name__icontains',
          isDefault: true,
        },
      ]}
      toolbarSearchableKeys={searchableKeys}
      toolbarRelatedSearchableKeys={relatedSearchableKeys}
      headerRow={
        <HeaderRow qsConfig={qsConfig} isSelectable={false}>
          <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
          {kind?.hasOrganization ? (
            <HeaderCell>{t`Organization`}</HeaderCell>
          ) : null}
        </HeaderRow>
      }
      renderToolbar={(props) => (
        <DataListToolbar {...props} qsConfig={qsConfig} />
      )}
      renderRow={(object: CarryingObject) => (
        <Tr
          key={object.id}
          id={`granted-row-${object.id}`}
          ouiaId={`granted-row-${object.id}`}
        >
          <Td dataLabel={t`Name`}>
            <Link
              to={
                roleResourceUrl({
                  summary_fields: {
                    resource_type: object.type,
                    resource_id: object.id,
                  },
                } as Role) as string
              }
            >
              {object.name}
            </Link>
          </Td>
          {kind?.hasOrganization && (
            <Td dataLabel={t`Organization`}>
              {/* A dash where there is none, as the label lists write an empty
                  count: an empty cell reads as a missing value. */}
              {object.summary_fields?.organization?.name || '-'}
            </Td>
          )}
        </Tr>
      )}
    />
  );
}

export default RoleObjects;
