import type { OAuth2Token } from 'types/api';
import type { CurrentUser } from 'contexts/Config';

/**
 * Whether the viewer may delete a token, asked the way the api asks it.
 *
 * Tokens carry no user_capabilities, so the lists and the details page work it
 * out themselves: a superuser or the token's owner may delete any token, and
 * an admin of the organization an application sits in may delete a token
 * issued through that application. The application's own delete capability
 * is granted to exactly those admins, so where the caller has the application
 * at hand, the application's Tokens tab, its capability settles it.
 *
 * Elsewhere the token names its application by id and name only. Should that
 * reference ever carry the application's user_capabilities, they are used;
 * otherwise which organization the application sits in is not known here, so
 * any organization admin is offered it and the api has the final word.
 *
 * Args:
 *   token: The token, as the tokens endpoints return it.
 *   me: The current user.
 *   adminOrgCount: How many organizations the current user administers.
 *   applicationCanDelete: The delete capability of the token's application,
 *     when the caller has read the application itself.
 *
 * Returns:
 *   True when the viewer should be offered the token's deletion.
 */
export default function canDeleteToken(
  token: Pick<OAuth2Token, 'summary_fields'>,
  me: CurrentUser | undefined,
  adminOrgCount: number | undefined,
  applicationCanDelete?: boolean
): boolean {
  const { summary_fields: summaryFields } = token;
  if (
    me?.is_superuser ||
    (me?.id !== undefined && summaryFields?.user?.id === me.id)
  ) {
    return true;
  }
  const application = summaryFields?.application as
    { user_capabilities?: { delete?: boolean } } | null | undefined;
  if (!application) {
    return false;
  }
  const appCanDelete =
    applicationCanDelete ?? application.user_capabilities?.delete;
  if (appCanDelete !== undefined) {
    return Boolean(appCanDelete);
  }
  return Boolean(adminOrgCount);
}

/**
 * Tokens as a list shows them, each carrying whether the viewer may delete it.
 *
 * Worked out when the list renders rather than when it reads the tokens: the
 * read is cached by the list's address, so a capability worked out inside it
 * kept the answer for whoever was signed in, and for the application as it
 * stood, when that page was first read.
 *
 * Args:
 *   tokens: The tokens, as the tokens endpoints return them.
 *   me: The current user.
 *   adminOrgCount: How many organizations the current user administers.
 *   applicationCanDelete: The delete capability of the tokens' application,
 *     when the caller has read the application itself.
 *
 * Returns:
 *   Each token with summary_fields.user_capabilities.delete set.
 */
export function withDeleteCapability<
  T extends Pick<OAuth2Token, 'summary_fields'>,
>(
  tokens: T[],
  me: CurrentUser | undefined,
  adminOrgCount: number | undefined,
  applicationCanDelete?: boolean
): T[] {
  return tokens.map((token) => ({
    ...token,
    summary_fields: {
      ...token.summary_fields,
      user_capabilities: {
        delete: canDeleteToken(token, me, adminOrgCount, applicationCanDelete),
      },
    },
  }));
}
