import type { Label } from 'types/api';
import type { CurrentUser } from 'contexts/Config';
import { UsersAPI } from 'api';

/** How many organizations one request asks for when reading them all. */
const PAGE_SIZE = 200;

/**
 * The organizations the current user administers, by id.
 *
 * A label carries no user_capabilities, so the screens cannot ask it whether
 * it may be changed. The api decides that by the label's organization alone:
 * a superuser may change any label, anyone else only one whose organization
 * they administer. Knowing those organizations therefore answers the question
 * for every label on screen at once.
 *
 * A superuser needs no list, and gets none: the request would only confirm
 * what is_superuser already says.
 *
 * Args:
 *     me: The current user, as the config context carries them.
 *
 * Returns:
 *     The ids of every organization the user is an admin of, empty for a
 *     superuser or for a user with no id yet.
 */
export async function readAdministeredOrganizationIds(
  me: CurrentUser | undefined
): Promise<Set<number>> {
  if (!me?.id || me.is_superuser) {
    return new Set();
  }
  const params = { page_size: PAGE_SIZE };
  const { data: firstPage } = await UsersAPI.readAdminOfOrganizations(me.id, {
    ...params,
    page: 1,
  });
  // Pages are fetched together rather than in a loop, so an admin of more
  // organizations than one page holds still has them all counted.
  const pageCount = Math.ceil((firstPage.count ?? 0) / PAGE_SIZE);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_unused, i) =>
      UsersAPI.readAdminOfOrganizations(me.id as number, {
        ...params,
        page: i + 2,
      })
    )
  );
  return new Set(
    [firstPage, ...rest.map(({ data }) => data)].flatMap((page) =>
      (page.results ?? []).map((organization) => organization.id)
    )
  );
}

/**
 * Whether the current user may edit and delete a label.
 *
 * The same rule the api applies to both: a superuser may, and so may an admin
 * of the label's organization. Offering either to anyone else only leads to a
 * form or a confirmation that ends in 403.
 *
 * Args:
 *     me: The current user, as the config context carries them.
 *     adminOrgIds: The organizations the user administers, as
 *         readAdministeredOrganizationIds answers.
 *     label: The label in question.
 *
 * Returns:
 *     True where the api will accept a change or a deletion.
 */
export function canChangeLabel(
  me: CurrentUser | undefined,
  adminOrgIds: Set<number>,
  label: Label
): boolean {
  if (me?.is_superuser) {
    return true;
  }
  const organizationId =
    label.organization ?? label.summary_fields?.organization?.id;
  return typeof organizationId === 'number' && adminOrgIds.has(organizationId);
}
