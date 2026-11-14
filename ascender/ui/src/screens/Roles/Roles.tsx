import React, { useCallback, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { PageSection } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';
import ScreenHeader from 'components/ScreenHeader/ScreenHeader';
import RoleList from './RoleList';
import Role from './Role';
import type { RoleCrumb } from './Role/Role';
import { typeLabel } from './roleTypes';

/**
 * The roles the platform defines, and what each one is on.
 *
 * Read only: a role here is granted and taken away on the object it belongs to,
 * through the access tab of that organization, template or inventory. Managing
 * them from this screen is what the platform's newer RBAC offers, which this
 * API does not.
 */
function Roles() {
  const { t, i18n } = useLingui();
  const [breadcrumbConfig, setBreadcrumbConfig] = useState<
    Record<string, string | null>
  >({ '/roles': t`Roles` });

  const updateBreadcrumb = useCallback(
    ({ model, roleField, name }: RoleCrumb) => {
      setBreadcrumbConfig({
        '/roles': t`Roles`,
        [`/roles/${model}`]: typeLabel(i18n, model),
        [`/roles/${model}/${roleField}`]: name,
        [`/roles/${model}/${roleField}/details`]: name,
        [`/roles/${model}/${roleField}/objects`]: name,
      });
    },
    [t, i18n]
  );

  /*
   * The list is titled Roles on every kind, whatever was opened before it.
   * The kind is a tab of the list rather than a page below it, and the crumb
   * a role registers for its kind used to linger once the reader came back:
   * the same address was titled Roles when opened directly and Teams when
   * reached from a team role.
   */
  const { pathname } = useLocation();
  const isList = pathname.split('/').filter(Boolean).length <= 2;
  const shownConfig = isList ? { '/roles': t`Roles` } : breadcrumbConfig;

  return (
    <>
      {/* The activity stream files a grant under the user or team and the
          object it is on, never under the role, so there is no stream of
          roles to open: a type of role matched nothing, and the stream's own
          selector has no such view. The header keeps its height without it. */}
      <ScreenHeader streamType="none" breadcrumbConfig={shownConfig} />
      <Routes>
        {/* so the nested <Role> route tree can match the rest */}
        <Route
          path=":model/:roleField/*"
          element={
            <PageSection hasBodyWrapper={false}>
              <Role setBreadcrumb={updateBreadcrumb} />
            </PageSection>
          }
        />
        {/* The kind on its own is the list opened on that kind's tab, which
            is where the trail's middle crumb goes. */}
        <Route
          path=":model"
          element={
            <PageSection hasBodyWrapper={false}>
              <RoleList />
            </PageSection>
          }
        />
        <Route
          path="*"
          element={
            <PageSection hasBodyWrapper={false}>
              <RoleList />
            </PageSection>
          }
        />
      </Routes>
    </>
  );
}

export default Roles;
