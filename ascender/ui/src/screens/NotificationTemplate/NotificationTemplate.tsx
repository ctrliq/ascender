import type { DetailedError, SetBreadcrumb } from 'types/api';
import React, { useEffect, useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Card, PageSection } from '@patternfly/react-core';
import { CaretLeftIcon } from '@patternfly/react-icons';
import {
  Link,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation,
} from 'react-router';
import useRequest from 'hooks/useRequest';
import RoutedTabs from 'components/RoutedTabs';
import ContentError from 'components/ContentError';
import { NotificationTemplatesAPI } from 'api';
import ContentLoading from 'components/ContentLoading';
import NotificationTemplateDetail from './NotificationTemplateDetail';
import NotificationTemplateEdit from './NotificationTemplateEdit';
import type { DefaultMessages } from './shared/NotificationTemplateForm';

export interface NotificationTemplateProps {
  setBreadcrumb: SetBreadcrumb;
  [key: string]: unknown;
}

function NotificationTemplate({ setBreadcrumb }: NotificationTemplateProps) {
  const { t } = useLingui();
  const { id: templateId } = useParams() as { id: string };
  const location = useLocation();
  const baseUrl = `/notifications/${templateId}`;
  const {
    result: { template, defaultMessages },
    isLoading,
    error,
    request: fetchTemplate,
  } = useRequest(
    useCallback(async () => {
      const [detail, options] = await Promise.all([
        NotificationTemplatesAPI.readDetail(templateId),
        NotificationTemplatesAPI.readOptions(),
      ]);
      setBreadcrumb(detail.data);
      return {
        template: detail.data,
        // The default message bodies the api ships, one set per notification
        // type, which the OPTIONS block carries as keys of the messages field
        // named after each type. Its own default is one set of empty messages
        // for every type, so reading that one left every default blank and
        // an untouched message was saved as an empty string. The Add screen
        // reads the same map.
        defaultMessages:
          (options.data.actions?.POST
            ?.messages as unknown as DefaultMessages) ?? {},
      };
    }, [templateId, setBreadcrumb]),
    // Loading from the first render: the read starts in an effect, after the
    // routes below have drawn once, and until then an idle hook with no
    // template sent every address to Not Found for a moment.
    {
      template: null,
      defaultMessages: {} as DefaultMessages,
      isLoading: true,
    }
  );

  useEffect(() => {
    // The bare /:id route immediately redirects to /:id/details, so skip the
    // fetch there; otherwise we would fetch once on /:id and again after the
    // redirect changes the pathname. Real navigation (e.g. edit -> details)
    // still re-fetches so the detail reflects saved changes.
    if (location.pathname === baseUrl) return;
    fetchTemplate();
  }, [fetchTemplate, location.pathname, baseUrl]);

  if (!isLoading && error) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={error}>
            {(error as DetailedError).response?.status === 404 && (
              <span>
                {t`Notification Template not found.`}{' '}
                <Link to="/notifications">{t`View all Notifications.`}</Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  const showCardHeader = !location.pathname.endsWith('edit');
  const tabs = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Notifications`}
        </>
      ),
      link: `/notifications`,
      id: 99,
      persistentFilterKey: 'notificationTemplates',
    },
    {
      name: t`Details`,
      link: `/notifications/${templateId}/details`,
      id: 0,
    },
  ];
  /*
   * One loading animation, in the place the content will be. Drawn per route
   * inside the card, the page arrived in pieces: a card and its tabs first, an
   * animation inside them, then the content. Asked with the template rather
   * than on its own, so a later read does not throw away a page already drawn.
   */
  /* The bare address is let through to its redirect, which has nothing to
     wait for: the read is skipped there and starts once it lands. */
  if (isLoading && !template && location.pathname !== baseUrl) {
    return (
      <PageSection hasBodyWrapper={false}>
        <ContentLoading />
      </PageSection>
    );
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        {showCardHeader && <RoutedTabs tabsArray={tabs} />}
        <Routes>
          <Route index element={<Navigate to="details" replace />} />
          {template && (
            <Route
              path="edit"
              element={
                <NotificationTemplateEdit
                  template={template}
                  defaultMessages={defaultMessages}
                />
              }
            />
          )}
          {template && (
            <Route
              path="details"
              element={
                <NotificationTemplateDetail
                  template={template}
                  defaultMessages={defaultMessages}
                />
              }
            />
          )}
          {/* A tab this template has no such thing as, rather than an empty
              card under the tab strip. */}
          <Route
            path="*"
            element={
              <ContentError isNotFound>
                <Link to={`/notifications/${templateId}/details`}>
                  {t`View Notification Template Details`}
                </Link>
              </ContentError>
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default NotificationTemplate;
