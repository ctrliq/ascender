import type { Role, User } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { RolesAPI, UsersAPI } from 'api';
import { CardBody } from 'components/Card';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import { Detail, DetailList } from 'components/DetailList';
import useRequest from 'hooks/useRequest';
import { SYSTEM, typeFilter, typeLabel } from '../roleTypes';
import './RoleDetail.css';

/**
 * The holders, read in one go: a role is held by a handful of accounts, and
 * what is left over is said as a count rather than paged through.
 */
const HOLDERS = 200;

export interface RoleDetailProps {
  /** Told what the role is called, so the screen can name it in the trail. */
  onLoad?: (name: string) => void;
}

/**
 * One role of one kind of object: what it allows, and who holds it.
 *
 * Every object of the kind carries this role, so the question worth answering
 * is not which objects have it but who has been given it, which is the same
 * question the access tab of each object answers one object at a time.
 */
function RoleDetail({ onLoad }: RoleDetailProps) {
  const { t, i18n } = useLingui();
  const { model, roleField } = useParams() as {
    model: string;
    roleField: string;
  };

  const {
    result: { role, users, userCount },
    error,
    isLoading,
    request: fetchRole,
  } = useRequest(
    useCallback(async () => {
      const [roleResponse, userResponse] = await Promise.all([
        RolesAPI.read({
          ...typeFilter(model),
          role_field: roleField,
          page_size: 1,
        }),
        UsersAPI.read({
          roles__role_field: roleField,
          ...(model === SYSTEM ? {} : { roles__content_type__model: model }),
          page_size: HOLDERS,
          order_by: 'username',
        }),
      ]);

      return {
        role: (roleResponse.data.results[0] ?? null) as Role | null,
        users: userResponse.data.results as User[],
        userCount: userResponse.data.count,
      };
    }, [model, roleField]),
    /*
     * Loading from the start, so a role not read yet is not taken for one
     * that does not exist.
     */
    {
      role: null as Role | null,
      users: [] as User[],
      userCount: 0,
      isLoading: true,
    }
  );

  useEffect(() => {
    fetchRole();
  }, [fetchRole]);

  useEffect(() => {
    if (role?.name) {
      onLoad?.(role.name);
    }
  }, [role, onLoad]);

  if (isLoading) {
    return <ContentLoading />;
  }
  if (error) {
    return <ContentError error={error} />;
  }
  if (!role) {
    return (
      <ContentError isNotFound>
        <Link to="/roles">{t`View all Roles.`}</Link>
      </ContentError>
    );
  }

  return (
    <CardBody className="ascender-role-detail__body">
      <DetailList>
        <Detail label={t`Name`} value={role.name} dataCy="role-name" />
        <Detail
          label={t`Type`}
          value={typeLabel(i18n, model)}
          dataCy="role-type"
        />
        <Detail
          label={t`Description`}
          value={role.description}
          dataCy="role-description"
        />
        <Detail
          fullWidth
          label={t`Users`}
          dataCy="role-users"
          isEmpty={userCount === 0}
          value={
            <>
              {users.map((user, index) => (
                <React.Fragment key={user.id}>
                  {index > 0 && ', '}
                  <Link to={`/users/${user.id}/details`}>{user.username}</Link>
                </React.Fragment>
              ))}
              {userCount > users.length &&
                `, ${t`and ${userCount - users.length} more`}`}
            </>
          }
        />
      </DetailList>
    </CardBody>
  );
}

export default RoleDetail;
