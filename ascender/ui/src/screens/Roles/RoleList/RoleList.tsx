import type { Role } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Card, Tab, Tabs, TabTitleText } from '@patternfly/react-core';
import { Td, Tr } from '@patternfly/react-table';
import { useLingui } from '@lingui/react/macro';
import { RolesAPI } from 'api';
import ContentError from 'components/ContentError';
import DataListToolbar from 'components/DataListToolbar';
import PaginatedTable, {
  HeaderCell,
  HeaderRow,
} from 'components/PaginatedTable';
import useRequest from 'hooks/useRequest';
import { getQSConfig, parseQueryString, updateQueryString } from 'util/qs';
import { ROLE_TYPES, SYSTEM, typeFilter } from '../roleTypes';
import './RoleList.css';

/**
 * The paging and the search, which this list applies to what it is holding
 * rather than sending on: a kind carries a handful of roles, read in one go
 * from one of its objects, so there is nothing to ask the api for a page of.
 */
const qsConfig = getQSConfig(
  'role',
  { page: 1, page_size: 20, order_by: 'name' },
  []
);

/** The two roles on nothing, by the field the api keys each on. */
const SYSTEM_ROLE_FIELDS = ['system_administrator', 'system_auditor'];

/** One role a kind of object carries, by the field the api keys it on. */
interface RoleKind {
  roleField: string;
  name: string;
  description: string;
}

/**
 * The roles this platform defines, a tab per kind of object they are on.
 *
 * Every object of a kind carries the same roles, so they are read once from
 * one object rather than listed per object: the alternative is Admin, Execute
 * and Read repeated once for every job template. What differs between objects
 * is who holds the role, which each role's own page answers.
 */
function RoleList() {
  const { t, i18n } = useLingui();
  const location = useLocation();
  const navigate = useNavigate();
  // The kind is the address, /roles/:model, so a reload, a shared link and
  // the trail's middle crumb all open the tab that was showing. /roles on its
  // own is the first kind.
  const { model: routeModel } = useParams() as { model?: string };
  const routeKind = routeModel
    ? ROLE_TYPES.find(({ key }) => key === routeModel)
    : ROLE_TYPES[0];
  const model = routeKind?.key ?? '';

  const {
    result: { kinds, hasSample },
    error,
    isLoading,
    request: fetchKinds,
  } = useRequest<{ kinds: RoleKind[]; hasSample: boolean }>(
    useCallback(async () => {
      if (model === SYSTEM) {
        /*
         * The roles on nothing are themselves the list, and there are two.
         * Each is asked for by the field it is keyed on rather than read off
         * its name, which the api translates into the viewer's language: the
         * name of the System Administrator role is not a field name anywhere
         * but in English. One the viewer may not see is left out.
         */
        const found = await Promise.all(
          SYSTEM_ROLE_FIELDS.map(async (roleField) => {
            const { data } = await RolesAPI.read({
              ...typeFilter(model),
              role_field: roleField,
            });
            const [role] = data.results as Role[];
            return role
              ? {
                  roleField,
                  name: role.name ?? '',
                  description: role.description ?? '',
                }
              : null;
          })
        );
        return {
          kinds: found.filter((kind): kind is RoleKind => Boolean(kind)),
          hasSample: true,
        };
      }

      const api = ROLE_TYPES.find(({ key }) => key === model)?.api;
      if (!api) {
        return { kinds: [], hasSample: true };
      }
      // Any object of the kind will do: they all carry the same roles.
      const { data } = await api.read({ page_size: 1, order_by: 'id' });
      const [sample] = data.results as {
        summary_fields?: { object_roles?: Record<string, unknown> };
      }[];
      const objectRoles = sample?.summary_fields?.object_roles ?? {};
      return {
        kinds: Object.entries(objectRoles).map(([roleField, role]) => ({
          roleField,
          name: (role as { name?: string }).name ?? '',
          description: (role as { description?: string }).description ?? '',
        })),
        // Nothing of the kind this viewer can see means nothing to read the
        // kind's roles off, which is not the same as a kind with no roles.
        hasSample: Boolean(sample),
      };
    }, [model]),
    { kinds: [], hasSample: true }
  );

  useEffect(() => {
    if (model) {
      fetchKinds();
    }
  }, [fetchKinds, model]);

  const {
    page = 1,
    page_size: pageSize = 20,
    order_by: orderBy = 'name',
    name__icontains: search,
  } = parseQueryString(qsConfig, location.search) as {
    page?: number;
    page_size?: number;
    order_by?: string;
    name__icontains?: string;
  };

  const matching = search
    ? kinds.filter(({ name }) =>
        name.toLowerCase().includes(String(search).toLowerCase())
      )
    : kinds;
  /*
   * Ordered here rather than by the api, for the same reason the rows are read
   * here: a kind's roles come in one go from one of its objects.
   */
  const descending = String(orderBy).startsWith('-');
  const sorted = [...matching].sort((one, other) =>
    descending
      ? other.name.localeCompare(one.name)
      : one.name.localeCompare(other.name)
  );
  const shown = sorted.slice((page - 1) * pageSize, page * pageSize);

  /*
   * Another kind starts on its first page. A page kept from a kind with more
   * roles would land past the end of one with fewer and show an empty list
   * with its count. The search stays, since it means the same thing on every
   * tab.
   */
  const handleTabSelect = (key: string) => {
    const qs = updateQueryString(qsConfig, location.search, { page: 1 });
    navigate(qs ? `/roles/${key}?${qs}` : `/roles/${key}`);
  };

  // A kind this platform does not grant roles on, /roles/bogus, is an address
  // that leads nowhere rather than a list of nothing.
  if (!routeKind) {
    return (
      <Card className="ascender-role-list">
        <ContentError isNotFound>
          <Link to="/roles">{t`View all Roles.`}</Link>
        </ContentError>
      </Card>
    );
  }

  return (
    <Card className="ascender-role-list">
      <Tabs
        aria-label={t`Role types`}
        activeKey={model}
        onSelect={(_event, eventKey) => handleTabSelect(String(eventKey))}
        ouiaId="role-type-tabs"
      >
        {ROLE_TYPES.map(({ key, label }) => (
          <Tab
            key={key}
            eventKey={key}
            title={<TabTitleText>{i18n._(label)}</TabTitleText>}
            ouiaId={`${key}-roles-tab`}
          />
        ))}
      </Tabs>
      <PaginatedTable
        contentError={error}
        hasContentLoading={isLoading}
        items={shown}
        itemCount={matching.length}
        pluralizedItemName={t`Roles`}
        emptyContentTitle={
          hasSample ? undefined : t`No objects of this kind to read roles from`
        }
        emptyContentMessage={
          hasSample
            ? undefined
            : t`The roles of a kind are read from one of its objects, and there is none you can see.`
        }
        qsConfig={qsConfig}
        toolbarSearchColumns={[
          {
            name: t`Name`,
            key: 'name__icontains',
            isDefault: true,
          },
        ]}
        headerRow={
          <HeaderRow qsConfig={qsConfig} isSelectable={false}>
            <HeaderCell sortKey="name">{t`Name`}</HeaderCell>
            <HeaderCell>{t`Description`}</HeaderCell>
          </HeaderRow>
        }
        renderToolbar={(props) => (
          <DataListToolbar {...props} qsConfig={qsConfig} />
        )}
        renderRow={({ roleField, name, description }: RoleKind) => (
          <Tr
            key={roleField}
            id={`role-row-${roleField}`}
            ouiaId={`role-row-${roleField}`}
          >
            <Td dataLabel={t`Name`}>
              <Link to={`/roles/${model}/${roleField}/details`}>
                <b>{name}</b>
              </Link>
            </Td>
            <Td dataLabel={t`Description`}>{description}</Td>
          </Tr>
        )}
      />
    </Card>
  );
}

export default RoleList;
