import React, { useCallback, useEffect } from 'react';
import { useLocation, useRouteMatch } from 'react-router-dom';

import { useLingui } from '@lingui/react';
import { t } from '@lingui/react/macro';
import { Card, PageSection } from '@patternfly/react-core';
import { NotificationTemplatesAPI } from 'api';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  ToolbarAddButton,
  ToolbarDeleteButton,
  getSearchableKeys,
} from 'components/PaginatedTable';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import DataListToolbar from 'components/DataListToolbar';
import useRequest, { useDeleteItems } from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import useToast, { AlertVariant } from 'hooks/useToast';
import { getQSConfig, parseQueryString } from 'util/qs';
import NotificationTemplateListItem from './NotificationTemplateListItem';

const QS_CONFIG = getQSConfig('notification-templates', {
  page: 1,
  page_size: 20,
  order_by: 'name',
});

function NotificationTemplatesList() {
  const location = useLocation();
  const match = useRouteMatch();
  const { i18n } = useLingui();
  // const [testToasts, setTestToasts] = useState([]);
  const { addToast, Toast, toastProps } = useToast();

  const addUrl = `${match.url}/add`;

  const {
    result: {
      templates,
      count,
      actions,
      relatedSearchableKeys,
      searchableKeys,
    },
    error: contentError,
    isLoading: isTemplatesLoading,
    request: fetchTemplates,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [response, actionsResponse] = await Promise.all([
        NotificationTemplatesAPI.read(params),
        NotificationTemplatesAPI.readOptions(),
      ]);
      return {
        templates: response.data.results,
        count: response.data.count,
        actions: actionsResponse.data.actions,
        relatedSearchableKeys: (
          actionsResponse.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [location]),
    {
      templates: [],
      count: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected(templates);

  const {
    isLoading: isDeleteLoading,
    deleteItems: deleteTemplates,
    deletionError,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(
      () =>
        Promise.all(
          selected.map(({ id }) => NotificationTemplatesAPI.destroy(id))
        ),
      [selected]
    ),
    {
      qsConfig: QS_CONFIG,
      allItemsSelected: isAllSelected,
      fetchItems: fetchTemplates,
    }
  );

  const handleDelete = async () => {
    await deleteTemplates();
    clearSelected();
  };

  const canAdd = actions && actions.POST;

  return (
    <>
      <PageSection>
        <Card>
          <PaginatedTable
            contentError={contentError}
            hasContentLoading={isTemplatesLoading || isDeleteLoading}
            items={templates}
            itemCount={count}
            pluralizedItemName={i18n._(t`Notification Templates`)}
            qsConfig={QS_CONFIG}
            clearSelected={clearSelected}
            toolbarSearchColumns={[
              {
                name: i18n._(t`Name`),
                key: 'name__icontains',
                isDefault: true,
              },
              {
                name: i18n._(t`Description`),
                key: 'description__icontains',
              },
              {
                name: i18n._(t`Notification type`),
                key: 'or__notification_type',
                options: [
                  ['email', i18n._(t`Email`)],
                  ['grafana', i18n._(t`Grafana`)],
                  ['hipchat', i18n._(t`Hipchat`)],
                  ['irc', i18n._(t`IRC`)],
                  ['mattermost', i18n._(t`Mattermost`)],
                  ['pagerduty', i18n._(t`Pagerduty`)],
                  ['rocketchat', i18n._(t`Rocket.Chat`)],
                  ['slack', i18n._(t`Slack`)],
                  ['twilio', i18n._(t`Twilio`)],
                  ['webhook', i18n._(t`Webhook`)],
                ],
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
            renderToolbar={(props) => (
              <DataListToolbar
                {...props}
                isAllSelected={isAllSelected}
                onSelectAll={selectAll}
                qsConfig={QS_CONFIG}
                additionalControls={[
                  ...(canAdd
                    ? [<ToolbarAddButton key="add" linkTo={addUrl} />]
                    : []),
                  <ToolbarDeleteButton
                    key="delete"
                    onDelete={handleDelete}
                    itemsToDelete={selected}
                    pluralizedItemName={i18n._(t`Notification Templates`)}
                  />,
                ]}
              />
            )}
            headerRow={
              <HeaderRow qsConfig={QS_CONFIG}>
                <HeaderCell sortKey="name">{i18n._(t`Name`)}</HeaderCell>
                <HeaderCell>{i18n._(t`Status`)}</HeaderCell>
                <HeaderCell sortKey="notification_type">
                  {i18n._(t`Type`)}
                </HeaderCell>
                <HeaderCell sortKey="organization">
                  {i18n._(t`Organization`)}
                </HeaderCell>
                <HeaderCell>{i18n._(t`Actions`)}</HeaderCell>
              </HeaderRow>
            }
            renderRow={(template, index) => (
              <NotificationTemplateListItem
                onAddToast={(notification) => {
                  if (notification.status === 'pending') {
                    return;
                  }

                  let message;
                  if (notification.status === 'successful') {
                    message = i18n._(t`Notification sent successfully`);
                  }
                  if (notification.status === 'failed') {
                    if (notification?.error === 'timed out') {
                      message = i18n._(t`Notification timed out`);
                    } else {
                      message = notification.error;
                    }
                  }

                  addToast({
                    id: notification.id,
                    title:
                      notification.summary_fields.notification_template.name,
                    variant:
                      notification.status === 'failed'
                        ? AlertVariant.danger
                        : AlertVariant.success,
                    hasTimeout: notification.status !== 'failed',
                    message,
                  });
                }}
                key={template.id}
                fetchTemplates={fetchTemplates}
                template={template}
                detailUrl={`${match.url}/${template.id}`}
                isSelected={selected.some((row) => row.id === template.id)}
                onSelect={() => handleSelect(template)}
                rowIndex={index}
              />
            )}
            emptyStateControls={
              canAdd ? <ToolbarAddButton key="add" linkTo={addUrl} /> : null
            }
          />
        </Card>
      </PageSection>
      <AlertModal
        isOpen={deletionError}
        variant="error"
        title={i18n._(t`Error!`)}
        onClose={clearDeletionError}
      >
        {i18n._(t`Failed to delete one or more notification template.`)}
        <ErrorDetail error={deletionError} />
      </AlertModal>
      <Toast {...toastProps} />
    </>
  );
}

export default NotificationTemplatesList;
