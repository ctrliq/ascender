import type { User } from 'types/api';
import type { CurrentUser } from 'contexts/Config';
import type { QSParams } from 'util/qs';
import { mergeParams } from 'util/qs';

/**
 * Whether the viewer may put a user in an organization or take them out.
 *
 * Membership is the organization's Member role, and the api grants it the way
 * it grants that role: a superuser anywhere, or an admin of the organization
 * who may also administer the user, which an organization admin may do only
 * for users who belong to no organization the admin does not run. The user's
 * own edit capability is the api's answer to that second half, and the admin
 * count says whether there is an organization to add them to at all. Whether
 * the viewer may create users, which the users endpoint's OPTIONS answers, is
 * a different question.
 *
 * Args:
 *   me: The current user.
 *   adminOrgCount: How many organizations the current user administers.
 *   user: The user whose memberships are listed.
 *
 * Returns:
 *   True when the viewer should be offered Associate and Disassociate. The
 *   api still has the final word on each organization.
 */
export function canManageOrganizationMembership(
  me: CurrentUser | undefined,
  adminOrgCount: number | undefined,
  user: Pick<User, 'summary_fields'> | undefined
): boolean {
  if (me?.is_superuser) {
    return true;
  }
  const canAdminUser = Boolean(
    (
      user?.summary_fields as
        { user_capabilities?: { edit?: boolean } } | undefined
    )?.user_capabilities?.edit
  );
  return Boolean(adminOrgCount) && canAdminUser;
}

/**
 * What a membership picker asks for: the objects the viewer administers, less
 * the ones the user is already in.
 *
 * The api lets the viewer grant a membership only on an organization or team
 * they administer, so offering the rest is offering a pick that fails. For a
 * superuser that filter is everything.
 *
 * Args:
 *   params: The picker's own paging and search.
 *   exclude: The filters that leave out what the user already belongs to.
 *
 * Returns:
 *   The query the picker reads with.
 */
export function membershipPickerParams(
  params: QSParams,
  exclude: QSParams
): QSParams {
  return mergeParams(params, { role_level: 'admin_role', ...exclude });
}
