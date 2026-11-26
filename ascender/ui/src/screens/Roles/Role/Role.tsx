import React, { useCallback } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router';
import { Card } from '@patternfly/react-core';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { useLingui } from '@lingui/react/macro';
import ContentError from 'components/ContentError';
import RoutedTabs from 'components/RoutedTabs';
import RoleDetail from '../RoleDetail';
import RoleObjects from '../RoleObjects';
import { SYSTEM, roleType, typeLabel } from '../roleTypes';

/** What the trail needs to name a role: the kind it is on, and its name. */
export interface RoleCrumb {
  model: string;
  roleField: string;
  name: string;
}

export interface RoleProps {
  /** Told once the role is read, so the screen can name it in the trail. */
  setBreadcrumb: (crumb: RoleCrumb) => void;
}

/**
 * One role, with the tab bar every object screen carries: the way back to the
 * list, and the views of the object itself. A role has one view, because this
 * api grants and revokes a role on the object it belongs to rather than here.
 */
function Role({ setBreadcrumb }: RoleProps) {
  const { t, i18n } = useLingui();
  const { model, roleField } = useParams() as {
    model: string;
    roleField: string;
  };

  const onLoad = useCallback(
    (name: string) => setBreadcrumb({ model, roleField, name }),
    [model, roleField, setBreadcrumb]
  );

  // A kind this platform does not grant roles on, /roles/bogus/..., has no
  // role to show, and no label but its own address to name a tab by.
  if (!roleType(model)) {
    return (
      <Card className="ascender-role-detail">
        <ContentError isNotFound>
          <Link to="/roles">{t`View all Roles.`}</Link>
        </ContentError>
      </Card>
    );
  }

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Roles`}
        </>
      ),
      // The list opened on this role's kind, which is where it was picked from.
      link: `/roles/${model}`,
      id: 99,
    },
    {
      name: t`Details`,
      link: `/roles/${model}/${roleField}/details`,
      id: 0,
    },
    /* What carries the role, which is every object of its kind. A role on
       nothing has none, so it has no tab either. */
    ...(model === SYSTEM
      ? []
      : [
          {
            name: typeLabel(i18n, model),
            link: `/roles/${model}/${roleField}/objects`,
            id: 1,
          },
        ]),
  ];

  return (
    <Card className="ascender-role-detail">
      <RoutedTabs tabsArray={tabsArray} />
      <Routes>
        <Route index element={<Navigate to="details" replace />} />
        <Route path="details" element={<RoleDetail onLoad={onLoad} />} />
        <Route path="objects" element={<RoleObjects />} />
        <Route
          path="*"
          element={
            <ContentError isNotFound>
              <Link to="/roles">{t`View all Roles.`}</Link>
            </ContentError>
          }
        />
      </Routes>
    </Card>
  );
}

export default Role;
