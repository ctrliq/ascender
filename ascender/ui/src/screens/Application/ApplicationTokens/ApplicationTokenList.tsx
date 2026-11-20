import type { OAuth2Token, SummaryFieldRef } from 'types/api';

import React, { useCallback, useMemo } from 'react';
import { useLingui } from '@lingui/react/macro';
import { useParams, useLocation, useNavigate } from 'react-router';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import { useConfig } from 'contexts/Config';
import { getQSConfig, parseQueryString } from 'util/qs';
import { TokensAPI, ApplicationsAPI } from 'api';
import ErrorDetail from 'components/ErrorDetail';
import AlertModal from 'components/AlertModal';
import useCachedRequest from 'hooks/useCachedRequest';
import { useDeleteItems } from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import DatalistToolbar from 'components/DataListToolbar';
import ToolbarDeleteButton from 'components/PaginatedTable/ToolbarDeleteButton';
import { withDeleteCapability } from '../../User/shared/canDeleteToken';
import ApplicationTokenListItem from './ApplicationTokenListItem';
/**
 * A token as this list holds it. The api gives a token no name, and the list
 * needs one for the delete confirmation, so the owner's username stands in.
 */
type NamedToken = OAuth2Token & { name?: string };

const QS_CONFIG = getQSConfig('applications', {
  page: 1,
  page_size: 20,
  order_by: 'user__username',
});

export interface ApplicationTokenListProps {
  /** The application itself, which a token added from here is for. */
  application?: SummaryFieldRef | null;
}

function ApplicationTokenList({
  application = null,
}: ApplicationTokenListProps) {
  const { t } = useLingui();
  const { id } = useParams() as { id: string };
  const location = useLocation();
  const navigate = useNavigate();
  const { me, adminOrgCount } = useConfig();
  // The application's delete capability is what an admin of its organization
  // holds, and that is who the api lets delete another user's token for it.
  // It is only unknown before the application has been read.
  const applicationCanDelete = application
    ? Boolean(
        (
          application.summary_fields as
            { user_capabilities?: { delete?: boolean } } | undefined
        )?.user_capabilities?.delete
      )
    : undefined;
  const {
    error,
    isLoading,
    result: {
      tokens: readTokens,
      itemCount,
      relatedSearchableKeys,
      searchableKeys,
      canAdd,
    },
    request: fetchTokens,
  } = useCachedRequest(
    ['application-token-list', id, location.search],
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [
        {
          data: { results, count },
        },
        actionsResponse,
      ] = await Promise.all([
        ApplicationsAPI.readTokens(id, params),
        ApplicationsAPI.readTokenOptions(id),
      ]);
      // Whether each may be deleted is worked out below, as the list renders.
      const modifiedResults: NamedToken[] = results.map((result) => ({
        ...result,
        summary_fields: {
          user: result.summary_fields.user,
          application: result.summary_fields.application,
        },
        name: result.summary_fields.user?.username as string | undefined,
      }));
      return {
        tokens: modifiedResults,
        itemCount: count,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
        // The application's own tokens endpoint offers POST to whoever may
        // make a token for it, which is who the Add button is for.
        canAdd: Boolean(actionsResponse.data.actions?.POST),
      };
    }, [id, location.search]),
    {
      tokens: [],
      itemCount: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
      canAdd: false,
    }
  );

  /*
   * Worked out as the list renders rather than inside the read, which is
   * cached by the list's address: the viewer, what they administer and the
   * application's own capability can all change under the same address.
   */
  const tokens = useMemo(
    () =>
      withDeleteCapability(
        readTokens,
        me,
        adminOrgCount as number | undefined,
        applicationCanDelete
      ),
    [readTokens, me, adminOrgCount, applicationCanDelete]
  );

  const { selected, isAllSelected, handleSelect, selectAll, clearSelected } =
    useSelected(tokens);
  const {
    isLoading: deleteLoading,
    deletionError,
    deleteItems: handleDeleteApplications,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(
      () =>
        Promise.all(
          selected.map(({ id: tokenId }) => TokensAPI.destroy(tokenId))
        ),
      [selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchTokens,
    }
  );

  const handleDelete = async () => {
    await handleDeleteApplications();
    clearSelected();
  };

  /*
   * A token is always made for the person making it, so Add opens the
   * viewer's own token form with this application filled in. That form is
   * where a new token is shown, once, in the clear; Cancel comes back here.
   */
  const addButton =
    canAdd && me?.id && application ? (
      <ToolbarAddButton
        key="add"
        tooltip={t`Add Token`}
        onClick={() =>
          navigate(`/users/${me.id}/tokens/add`, {
            state: {
              application: { id: application.id, name: application.name },
            },
          })
        }
      />
    ) : null;

  /*
   * An application has no token page of its own: a token's details live under
   * the user it belongs to. That page reads the user as well as the token, so
   * the row links to it only for the token's owner or a superuser, who can
   * always open it; for anyone else the username is plain text.
   */
  const tokenDetailUrl = (token: OAuth2Token): string | null => {
    const ownerId = token.summary_fields.user?.id;
    if (!ownerId || !(me?.is_superuser || ownerId === me?.id)) {
      return null;
    }
    return `/users/${ownerId}/tokens/${token.id}/details`;
  };

  return (
    <>
      <PaginatedTable
        contentError={error}
        hasContentLoading={isLoading || deleteLoading}
        items={tokens}
        itemCount={itemCount}
        pluralizedItemName={t`Tokens`}
        qsConfig={QS_CONFIG}
        toolbarSearchColumns={[
          {
            name: t`Username`,
            key: 'user__username__icontains',
            isDefault: true,
          },
        ]}
        clearSelected={clearSelected}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        renderToolbar={(props) => (
          <DatalistToolbar
            {...props}
            isAllSelected={isAllSelected}
            onSelectAll={selectAll}
            additionalControls={[
              ...(addButton ? [addButton] : []),
              <ToolbarDeleteButton
                key="delete"
                onDelete={handleDelete}
                // As the list now has them, so the button weighs the current
                // capability rather than the one a row was ticked under.
                itemsToDelete={selected.map(
                  (ticked) =>
                    tokens.find((token) => token.id === ticked.id) ?? ticked
                )}
                pluralizedItemName={t`Tokens`}
              />,
            ]}
          />
        )}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG}>
            <HeaderCell sortKey="user__username">{t`Username`}</HeaderCell>
            <HeaderCell sortKey="scope">{t`Scope`}</HeaderCell>
            <HeaderCell sortKey="expires">{t`Expires`}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(token) => (
          <ApplicationTokenListItem
            key={token.id}
            token={token}
            isSelected={selected.some((row) => row.id === token.id)}
            onSelect={() => handleSelect(token)}
            detailUrl={tokenDetailUrl(token)}
            backTo={`/applications/${id}/tokens${location.search}`}
            rowIndex={tokens.findIndex((to: OAuth2Token) => to.id === token.id)}
          />
        )}
      />
      {Boolean(deletionError) && (
        <AlertModal
          isOpen={Boolean(deletionError)}
          variant="error"
          title={t`Error!`}
          onClose={clearDeletionError}
        >
          {t`Failed to delete one or more tokens.`}
          <ErrorDetail error={deletionError} />
        </AlertModal>
      )}
    </>
  );
}

export default ApplicationTokenList;
