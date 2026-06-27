import React, { useEffect, useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Card, PageSection } from '@patternfly/react-core';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { Link,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation } from 'react-router';
import useRequest from 'hooks/useRequest';
import RoutedTabs from 'components/RoutedTabs';
import ContentError from 'components/ContentError';
import { NotificationTemplatesAPI } from 'api';
import ContentLoading from 'components/ContentLoading';
import NotificationTemplateDetail from './NotificationTemplateDetail';
import NotificationTemplateEdit from './NotificationTemplateEdit';

function NotificationTemplate({ setBreadcrumb }) {
  const { t } = useLingui();
  const { id: templateId } = useParams();
  const location = useLocation();
  const baseUrl = `/notification_templates/${templateId}`;
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
        defaultMessages: options.data.actions?.POST?.messages,
      };
    }, [templateId, setBreadcrumb]),
    { template: null, defaultMessages: null }
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
            {error.response?.status === 404 && (
              <span>
                {t`Notification Template not found.`}{' '}
                <Link to="/notification_templates">
                  {t`View all Notification Templates.`}
                </Link>
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
      link: `/notification_templates`,
      id: 99,
      persistentFilterKey: 'notificationTemplates',
    },
    {
      name: t`Details`,
      link: `/notification_templates/${templateId}/details`,
      id: 0,
    },
  ];
  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        {showCardHeader && <RoutedTabs tabsArray={tabs} />}
        <Routes>
          <Route index element={<Navigate to="details" replace />} />
          <Route
            path="edit"
            element={
              template ? (
                <NotificationTemplateEdit
                  template={template}
                  defaultMessages={defaultMessages}
                />
              ) : (
                <ContentLoading />
              )
            }
          />
          <Route
            path="details"
            element={
              template ? (
                <NotificationTemplateDetail
                  template={template}
                  defaultMessages={defaultMessages}
                />
              ) : (
                <ContentLoading />
              )
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default NotificationTemplate;
